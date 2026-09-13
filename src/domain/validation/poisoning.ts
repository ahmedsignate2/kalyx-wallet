/**
 * Détection d'EMPOISONNEMENT d'adresse (§4.3) : un attaquant envoie une
 * poussière depuis une adresse dont les 4 premiers et 4 derniers caractères
 * imitent un destinataire habituel ; l'utilisateur copie la mauvaise depuis
 * son historique. Si l'adresse saisie RESSEMBLE à une adresse connue (même
 * début + même fin) mais diffère au milieu → alerte bloquante.
 *
 * Pur, testé. Comparaison insensible à la casse (EVM) ; Solana/BTC sensibles.
 */
export interface PoisoningMatch {
  /** L'adresse connue imitée. */
  lookalike: string;
}

function core(a: string): string {
  const s = a.trim();
  return s.startsWith('0x') || s.startsWith('0X') ? s.slice(2) : s;
}
function norm(a: string): string {
  const s = a.trim();
  return s.startsWith('0x') || s.startsWith('0X') ? s.toLowerCase() : s;
}

/**
 * `known` : adresses de confiance (récents, contacts, mes comptes).
 * Renvoie l'adresse imitée si `candidate` est un sosie, sinon null.
 */
export function detectPoisoning(candidate: string, known: string[], edge = 4): PoisoningMatch | null {
  const c = norm(candidate);
  const cc = core(c);
  if (cc.length < edge * 2 + 1) return null;
  for (const k of known) {
    const kn = norm(k);
    if (kn === c) return null; // exactement une adresse connue → OK
    const kc = core(kn);
    if (kc.length !== cc.length) continue;
    if (kc.slice(0, edge) === cc.slice(0, edge) && kc.slice(-edge) === cc.slice(-edge)) {
      return { lookalike: k };
    }
  }
  return null;
}

/** Adresse en groupes de 4 caractères, lisible à voix haute (§4.4). */
export function groupAddress(address: string, size = 4): string {
  const s = address.trim();
  const has0x = s.startsWith('0x') || s.startsWith('0X');
  const body = has0x ? s.slice(2) : s;
  const groups = body.match(new RegExp(`.{1,${size}}`, 'g')) ?? [];
  return (has0x ? '0x' : '') + groups.join(' ');
}

/** Début + fin en gras : « 0xd8dA…f8F7 » — les 4 derniers pour la vérification (§6). */
export function shortAddress(address: string, head = 6, tail = 4): string {
  const s = address.trim();
  if (s.length <= head + tail + 1) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}
