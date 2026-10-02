/**
 * LISTE BLANCHE DES DESTINATAIRES — protection anti-vol.
 *
 * Activée, elle n'autorise d'envoi QUE vers les adresses de la liste (et les
 * comptes de l'utilisateur). Ce qui RELÂCHE la protection est différé :
 *  - une adresse ajoutée n'est utilisable qu'après `DELAY_MS` (24 h) ;
 *  - la désactivation ne prend effet qu'après le même délai.
 * Ce qui la RENFORCE est immédiat : activer, retirer une adresse, annuler une
 * désactivation demandée.
 *
 * Un voleur qui connaît le code ne peut donc ni ajouter son adresse ni couper la
 * protection pour vider le portefeuille sur-le-champ — et l'utilisateur a 24 h
 * pour réagir (déplacer ses fonds, annuler).
 *
 * L'HEURE qui compte est passée par l'appelant : l'heure de la blockchain, pas
 * celle du téléphone (qu'un voleur peut avancer). Inconnue → rien de différé
 * ne devient actif (prudence).
 */
export const WHITELIST_DELAY_MS = 24 * 3600 * 1000;

export interface WhitelistEntry {
  /** Adresse telle que saisie (forme d'affichage). */
  address: string;
  label: string;
  /** Moment (ms, heure de chaîne) à partir duquel l'adresse est utilisable. */
  activeAt: number;
}

export interface WhitelistState {
  enabled: boolean;
  entries: WhitelistEntry[];
  /**
   * Portefeuilles DE CONFIANCE (leurs comptes reçoivent sans liste) : ceux qui
   * existaient à l'activation, tout de suite ; ceux créés ou importés ENSUITE,
   * après le délai — sinon un voleur importerait sa clé pour en faire « un de
   * tes comptes » et envoyer dessus sur-le-champ.
   */
  trusted: { id: string; activeAt: number }[];
  /** Désactivation demandée : effective à ce moment (heure de chaîne), sinon null. */
  disableAt: number | null;
}

export const EMPTY_WHITELIST: WhitelistState = { enabled: false, entries: [], trusted: [], disableAt: null };

export type Verdict = { kind: 'allowed' } | { kind: 'pending'; activeAt: number } | { kind: 'blocked' };

/** La protection est-elle EN VIGUEUR à `now` ? (une désactivation différée ne compte qu'une fois échue) */
export function isEnforced(s: WhitelistState, now: number | null): boolean {
  if (!s.enabled) return false;
  if (s.disableAt == null) return true;
  return now == null || now < s.disableAt;
}

/**
 * Peut-on envoyer à `address` ? `keyOf` compare les adresses (règle de casse et
 * formes TON) ; `isOwn` dit si c'est un compte de l'utilisateur (toujours permis).
 */
export function checkRecipient(
  s: WhitelistState,
  address: string,
  now: number | null,
  keyOf: (a: string) => string,
  isOwn: (a: string) => boolean,
): Verdict {
  if (!isEnforced(s, now)) return { kind: 'allowed' };
  if (isOwn(address)) return { kind: 'allowed' };
  const k = keyOf(address);
  const e = s.entries.find((x) => keyOf(x.address) === k);
  if (!e) return { kind: 'blocked' };
  // activeAt 0 : ajoutée quand la protection était éteinte — utilisable sans délai ni heure.
  return e.activeAt === 0 || (now != null && now >= e.activeAt) ? { kind: 'allowed' } : { kind: 'pending', activeAt: e.activeAt };
}

/**
 * Ajout : utilisable après le délai — sauf si la protection est éteinte (rien à
 * protéger) : utilisable dès l'activation (`activeAt` 0, aucune heure requise).
 */
export function addEntry(s: WhitelistState, address: string, label: string, now: number | null, keyOf: (a: string) => string): WhitelistState {
  const k = keyOf(address);
  if (s.entries.some((x) => keyOf(x.address) === k)) return s;
  if (s.enabled && now == null) throw new Error('Heure de chaîne requise');
  const activeAt = s.enabled ? now! + WHITELIST_DELAY_MS : 0;
  return { ...s, entries: [...s.entries, { address: address.trim(), label: label.trim(), activeAt }] };
}

/** Retrait : immédiat (il ne fait que renforcer). */
export function removeEntry(s: WhitelistState, address: string, keyOf: (a: string) => string): WhitelistState {
  const k = keyOf(address);
  return { ...s, entries: s.entries.filter((x) => keyOf(x.address) !== k) };
}

/**
 * Activer : immédiat ; annule une désactivation en attente. Les portefeuilles
 * PRÉSENTS deviennent de confiance tout de suite (`walletIds`).
 */
export function enable(s: WhitelistState, walletIds: readonly string[] = []): WhitelistState {
  const have = new Set(s.trusted.map((x) => x.id));
  const trusted = [...s.trusted, ...walletIds.filter((id) => !have.has(id)).map((id) => ({ id, activeAt: 0 }))];
  return { ...s, enabled: true, disableAt: null, trusted };
}

/** Portefeuille créé ou importé : de confiance après le délai si la protection est active (sinon : à l'activation). */
export function noteWallet(s: WhitelistState, id: string, now: number | null): WhitelistState {
  if (!s.enabled || s.trusted.some((x) => x.id === id)) return s;
  // Heure inconnue : jamais de confiance sans délai mesuré — on retentera.
  if (now == null) return s;
  return { ...s, trusted: [...s.trusted, { id, activeAt: now + WHITELIST_DELAY_MS }] };
}

/** Ce portefeuille est-il de confiance À `now` ? */
export function isTrustedWallet(s: WhitelistState, id: string, now: number | null): boolean {
  const t = s.trusted.find((x) => x.id === id);
  return !!t && (t.activeAt === 0 || (now != null && now >= t.activeAt));
}

/** Demander la désactivation : effective après le délai (déjà demandée → inchangée). */
export function requestDisable(s: WhitelistState, now: number): WhitelistState {
  if (!s.enabled || s.disableAt != null) return s;
  return { ...s, disableAt: now + WHITELIST_DELAY_MS };
}

/** Une désactivation échue est appliquée (état « éteint » propre). */
export function settle(s: WhitelistState, now: number | null): WhitelistState {
  if (s.enabled && s.disableAt != null && now != null && now >= s.disableAt) return { ...s, enabled: false, disableAt: null };
  return s;
}

/** Lecture tolérante d'un état stocké (champ manquant ou abîmé → valeur sûre). */
export function parseWhitelist(raw: string | null): WhitelistState {
  if (!raw) return EMPTY_WHITELIST;
  try {
    const o = JSON.parse(raw) as Partial<WhitelistState>;
    const entries = Array.isArray(o.entries)
      ? o.entries.filter((e): e is WhitelistEntry => !!e && typeof e.address === 'string' && typeof e.activeAt === 'number').map((e) => ({ address: e.address, label: typeof e.label === 'string' ? e.label : '', activeAt: e.activeAt }))
      : [];
    const trusted = Array.isArray(o.trusted)
      ? o.trusted.filter((x): x is { id: string; activeAt: number } => !!x && typeof x.id === 'string' && typeof x.activeAt === 'number')
      : [];
    return { enabled: o.enabled === true, entries, trusted, disableAt: typeof o.disableAt === 'number' ? o.disableAt : null };
  } catch {
    /*
     * Illisible : on ne sait pas si la protection était active. Plutôt que
     * l'éteindre en silence (cadeau à un attaquant qui corromprait le fichier),
     * on la considère ACTIVE et vide : l'utilisateur verra qu'il faut la refaire.
     */
    return { enabled: true, entries: [], trusted: [], disableAt: null };
  }
}
