/**
 * Liste blanche des destinataires — état, stockage chiffré, horloge de chaîne,
 * et les VERROUS. Règles : src/domain/security/whitelist.ts.
 *
 * Menace visée : un voleur qui connaît le code. Tant que la protection est EN
 * VIGUEUR, tout ce qui permettrait de vider le portefeuille sur-le-champ est
 * fermé, pas seulement le bouton Envoyer :
 *  - envois : seulement vers la liste et les portefeuilles DE CONFIANCE
 *    (assertRecipientAllowed, appelé par walletStore.sendDraft) ;
 *  - transactions et signatures demandées par des dApps (navigateur,
 *    WalletConnect, TON Connect, Solana Pay) : refusées (assertDappAllowed) —
 *    on ne peut pas garantir où va l'argent d'un contrat arbitraire ;
 *  - export des secrets (phrase, clé privée, sauvegarde) : refusé
 *    (assertSecretsExportable) — sinon il suffirait de les importer ailleurs.
 * Les parcours construits par l'app vers SES comptes (échange, Earn,
 * révocation, accélération) restent permis.
 *
 * - Trousseau, mêmes options que les coffres (cet appareil, déverrouillé).
 * - L'heure vient du dernier bloc (Ethereum, Base, Arbitrum, au plus rapide),
 *   avancée ensuite par une horloge MONOTONE : changer l'heure du téléphone
 *   n'avance rien.
 */
import { create } from 'zustand';
import {
  EvmChainAdapter,
  withTimeout,
  whitelistHoursUntil,
  EMPTY_WHITELIST,
  WalletError,
  checkRecipient,
  getAdapter,
  listChains,
  parseWhitelist,
  whitelistAdd,
  whitelistEnable,
  whitelistEnforced,
  whitelistNoteWallet,
  whitelistRemove,
  whitelistRequestDisable,
  whitelistSettle,
  whitelistTrustedWallet,
  type WhitelistState,
} from '../src';
import { KV_DEVICE_ONLY, kvDel, kvGet, kvSet } from './kv';
import { addressKey } from './txAuditProbe';
import { buildAddressIndex, lookupAddress } from './isMyAddress';
import { loadAccounts } from './secureStore';
import { useWallet, type Unlock } from './walletStore';
import { isDecoySession, onDecoyChange } from './sessionMode';

// Entrée en session leurre : la vraie liste quitte la mémoire ; sortie : relue au besoin.
onDecoyChange(() => useWhitelist.setState({ wl: EMPTY_WHITELIST, loaded: false }));

const K_WHITELIST = 'kalyx.whitelist';
const KV_OPTS = KV_DEVICE_ONLY;
const TIME_CHAINS = ['ethereum', 'base', 'arbitrum'];
const TIME_TTL_MS = 60_000;

/** Horloge monotone (indépendante de l'heure réglée sur le téléphone). */
const mono = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
let anchor: { chain: number; mono: number } | null = null;

/** Oublie l'ancre d'heure : la prochaine lecture repart de la chaîne (tests, changement de réseau). */
export function resetChainClock(): void {
  anchor = null;
}

/** Écart toléré entre sources, et saut maximal par rapport à l'heure déjà établie. */
const TIME_TOLERANCE_MS = 15 * 60_000;
const SOURCE_TIMEOUT_MS = 6_000;
let inflightNow: Promise<number | null> | null = null;

/**
 * Heure de CHAÎNE (ms), ou null si aucun réseau ne répond. Les trois réseaux
 * sont interrogés ensemble (une lecture partagée entre appelants) :
 *  - trois réponses → la MÉDIANE (une source menteuse ne décide pas seule) ;
 *  - deux → acceptées si elles concordent (15 min) ;
 *  - une seule → acceptée sans heure établie, sinon seulement si elle concorde
 *    avec l'heure établie avancée par l'horloge monotone : un nœud seul qui
 *    annoncerait « dans 2 jours » ne fait pas échoir les délais.
 */
export function chainNow(): Promise<number | null> {
  if (anchor && mono() - anchor.mono < TIME_TTL_MS) return Promise.resolve(anchor.chain + (mono() - anchor.mono));
  if (inflightNow) return inflightNow;
  inflightNow = (async () => {
    const known = new Set(listChains().map((c) => c.id));
    const sources = TIME_CHAINS.filter((id) => known.has(id))
      .map((id) => getAdapter(id))
      .filter((a): a is EvmChainAdapter => a instanceof EvmChainAdapter);
    const got = (
      await Promise.all(sources.map((a) => withTimeout(a.getLatestBlockTime(), SOURCE_TIMEOUT_MS, () => new Error('timeout')).catch(() => null)))
    ).filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
    const projected = anchor ? anchor.chain + (mono() - anchor.mono) : null;
    let t: number | null = null;
    const sorted = [...got].sort((a, b) => a - b);
    if (sorted.length >= 3) {
      t = sorted[1]; // médiane : une source menteuse ne décide pas seule
    } else if (sorted.length === 2) {
      // Deux sources : elles doivent concorder.
      if (sorted[1] - sorted[0] <= TIME_TOLERANCE_MS) t = sorted[1];
    } else if (sorted.length === 1) {
      /*
       * Une seule source : acceptée sans heure établie ; sinon seulement si
       * elle concorde avec la projection (pas de saut en avant suspect). Un
       * téléphone resté en veille rattrape l'heure dès que deux sources répondent.
       */
      if (projected == null || Math.abs(sorted[0] - projected) <= TIME_TOLERANCE_MS) t = sorted[0];
    }
    if (t != null) {
      anchor = { chain: t, mono: mono() };
      return t;
    }
    return projected; // ancre connue : toujours mieux que l'heure du téléphone ; sinon null
  })().finally(() => {
    inflightNow = null;
  });
  return inflightNow;
}

export const useWhitelist = create<{ wl: WhitelistState; loaded: boolean }>(() => ({ wl: EMPTY_WHITELIST, loaded: false }));

/** Génération : une réinitialisation rend caduques les écritures en cours. */
let generation = 0;

/**
 * Lit l'état. Lecture du trousseau en échec (passager) : on applique la
 * protection pour CET appel (jamais éteinte en silence) sans le mémoriser ni
 * l'écrire — l'appel suivant relira. `ok` faux = ne pas écrire par-dessus.
 */
async function read(): Promise<{ wl: WhitelistState; ok: boolean }> {
  // Session leurre : la vraie liste n'existe pas ici (ni lue, ni appliquée).
  if (isDecoySession()) return { wl: EMPTY_WHITELIST, ok: true };
  const st = useWhitelist.getState();
  if (st.loaded) return { wl: st.wl, ok: true };
  let raw: string | null;
  try {
    raw = await kvGet(K_WHITELIST, KV_OPTS);
  } catch {
    return { wl: parseWhitelist('{illisible'), ok: false };
  }
  const wl = parseWhitelist(raw);
  useWhitelist.setState({ wl, loaded: true });
  return { wl, ok: true };
}

/** État À JOUR (une désactivation échue est appliquée et enregistrée ; notes en attente retentées). */
export async function loadWhitelist(): Promise<WhitelistState> {
  if (pendingNotes.size) await flushNotes().catch(() => {});
  const { wl, ok } = await read();
  if (!ok || !wl.enabled) return wl;
  // Désactivation échue, ou délai « pas encore démarré » d'un portefeuille noté hors ligne : réglés avec l'heure.
  if (wl.disableAt == null && !wl.trusted.some((x) => x.activeAt < 0)) return wl;
  const now = await chainNow();
  const settled = whitelistSettle(wl, now);
  if (settled !== wl) await mutate((cur, n) => whitelistSettle(cur, n)).catch(() => {});
  return settled;
}

/** Modifications en file : jamais deux écritures croisées, ni une écriture après une réinitialisation. */
let queue: Promise<unknown> = Promise.resolve();
function mutate(fn: (wl: WhitelistState, now: number | null) => WhitelistState | Promise<WhitelistState>): Promise<void> {
  const gen = generation;
  const decoyAtStart = isDecoySession();
  const run = queue.catch(() => {}).then(async () => {
    const { wl, ok } = await read();
    if (!ok) throw new WalletError('VAULT_CORRUPTED', 'Liste blanche illisible pour le moment : réessaie.');
    const now = await chainNow();
    const next = await fn(whitelistSettle(wl, now), now);
    if (decoyAtStart || isDecoySession()) {
      // Session leurre (au départ OU maintenant) : jamais par-dessus la vraie liste.
      if (isDecoySession()) useWhitelist.setState({ wl: next });
      return;
    }
    if (gen !== generation) return; // réinitialisée entre-temps : rien n'est réécrit (la réinitialisation passe APRÈS, dans la file)
    await kvSet(K_WHITELIST, JSON.stringify(next), KV_OPTS);
    useWhitelist.setState({ wl: next, loaded: true });
  });
  queue = run;
  return run;
}

/** Portefeuilles à noter (création ou import) dont la note n'a pas encore été écrite. */
const pendingNotes = new Set<string>();
function flushNotes(): Promise<void> {
  if (!pendingNotes.size || isDecoySession()) return Promise.resolve(); // gardées pour la vraie session
  const ids = [...pendingNotes];
  return mutate((wl, now) => ids.reduce((acc, id) => whitelistNoteWallet(acc, id, now), wl)).then(() => {
    for (const id of ids) pendingNotes.delete(id);
  });
}

/** Heure de chaîne EXIGÉE pour démarrer un délai : sans elle, l'heure du téléphone le raccourcirait. */
function needNow(now: number | null): number {
  if (now == null) throw new WalletError('RPC_UNAVAILABLE', 'Heure du réseau indisponible : réessaie dans un instant.');
  return now;
}

const keyWalletIds = () => useWallet.getState().wallets.filter((w) => w.type !== 'watch').map((w) => w.id);

export const whitelistActions = {
  enable: (unlock: Unlock) =>
    mutate(async (wl) => {
      await useWallet.getState().verifyUnlock(unlock);
      return whitelistEnable(wl, keyWalletIds()); // portefeuilles présents : de confiance tout de suite
    }),
  add: (address: string, label: string, unlock: Unlock) =>
    mutate(async (wl, now) => {
      await useWallet.getState().verifyUnlock(unlock);
      // Protection éteinte : pas de délai, donc pas d'heure requise.
      return whitelistAdd(wl, address, label, wl.enabled ? needNow(now) : now, addressKey);
    }),
  remove: (address: string) => mutate((wl) => whitelistRemove(wl, address, addressKey)),
  requestDisable: (unlock: Unlock) =>
    mutate(async (wl, now) => {
      await useWallet.getState().verifyUnlock(unlock);
      return whitelistRequestDisable(wl, needNow(now));
    }),
  /** Annuler une désactivation demandée = réactiver : renforce, sans code. */
  cancelDisable: () => mutate((wl) => (wl.enabled ? whitelistEnable(wl) : wl)),
  /**
   * Portefeuille créé ou importé : de confiance seulement après le délai
   * (protection active). Une note qui échoue (trousseau muet) est RETENUE et
   * retentée à chaque lecture, jusqu'à réussir.
   */
  noteNewWallet: (id: string) => {
    pendingNotes.add(id);
    return flushNotes();
  },
  /** Réinitialisation de l'app : la liste part avec les portefeuilles. Dans la file : aucune écriture ne la suit. */
  wipe: () => {
    generation += 1;
    pendingNotes.clear();
    const run = queue.catch(() => {}).then(async () => {
      await kvDel(K_WHITELIST, KV_OPTS).catch(() => {});
      useWhitelist.setState({ wl: EMPTY_WHITELIST, loaded: true });
    });
    queue = run;
    return run;
  },
};

/** Protection en vigueur maintenant ? (avec l'état à jour et l'heure de chaîne) */
async function enforcedNow(): Promise<{ wl: WhitelistState; now: number | null } | null> {
  const wl = await loadWhitelist();
  if (!wl.enabled) return null;
  const now = await chainNow();
  return whitelistEnforced(wl, now) ? { wl, now } : null;
}

/** Comptes des portefeuilles DE CONFIANCE (une adresse suivie, ou un portefeuille trop récent, n'en est pas). */
async function trustedIndex(wl: WhitelistState, now: number | null) {
  const st = useWallet.getState();
  const list = await Promise.all(
    st.wallets
      .filter((w) => w.type !== 'watch' && whitelistTrustedWallet(wl, w.id, now))
      .map(async (w) => ({ walletId: w.id, accounts: (w.id === st.activeWalletId ? st.accounts : await loadAccounts(w.id)) ?? [] })),
  );
  return buildAddressIndex(list);
}

/**
 * VERROU d'envoi — appelé par le magasin avant de signer. Lève NOT_WHITELISTED
 * ou WHITELIST_PENDING (heures restantes en `meta.hours`) ; sinon ne fait rien.
 */
export async function assertRecipientAllowed(to: string): Promise<void> {
  const on = await enforcedNow();
  if (!on) return;
  const own = await trustedIndex(on.wl, on.now);
  const v = checkRecipient(on.wl, to, on.now, addressKey, (a) => !!lookupAddress(own, a));
  if (v.kind === 'blocked') throw new WalletError('NOT_WHITELISTED', 'Destinataire absent de la liste blanche');
  if (v.kind === 'pending') {
    const hours = String(whitelistHoursUntil(v.activeAt, on.now));
    throw new WalletError('WHITELIST_PENDING', 'Destinataire dans son délai de sûreté', { activeAt: String(v.activeAt), hours });
  }
}

/** VERROU dApps : aucune transaction ni signature de dApp tant que la protection est en vigueur. */
export async function assertDappAllowed(): Promise<void> {
  if (await enforcedNow()) throw new WalletError('WHITELIST_LOCKED', 'Liste blanche active : transactions de dApps désactivées');
}

/** VERROU secrets : ni phrase, ni clé privée, ni sauvegarde tant que la protection est en vigueur. */
export async function assertSecretsExportable(): Promise<void> {
  if (await enforcedNow()) throw new WalletError('WHITELIST_LOCKED', 'Liste blanche active : export des secrets désactivé');
}
