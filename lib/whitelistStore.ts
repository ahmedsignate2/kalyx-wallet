/**
 * Liste blanche des destinataires — état, stockage chiffré, horloge de chaîne,
 * et le VERROU appelé avant toute signature d'envoi (walletStore.sendDraft).
 * Règles : src/domain/security/whitelist.ts.
 *
 * - Stockée dans le trousseau (expo-secure-store), comme les coffres.
 * - Toute modification qui RELÂCHE la protection (activer — pour éviter une
 *   activation par erreur —, ajouter, demander la désactivation) exige le code
 *   ou la biométrie. Retirer une adresse ou annuler une désactivation, non :
 *   cela ne fait que renforcer.
 * - L'heure vient du dernier bloc (Ethereum, Base, Arbitrum), avancée ensuite
 *   par une horloge MONOTONE : changer l'heure du téléphone n'avance rien.
 */
import { create } from 'zustand';
import {
  EvmChainAdapter,
  EMPTY_WHITELIST,
  WalletError,
  checkRecipient,
  getAdapter,
  listChains,
  parseWhitelist,
  whitelistAdd,
  whitelistEnable,
  whitelistEnforced,
  whitelistRemove,
  whitelistRequestDisable,
  whitelistSettle,
  type WhitelistState,
} from '../src';
import { kvDel, kvGet, kvSet } from './kv';
import { addressKey } from './txAuditProbe';
import { buildAddressIndex, lookupAddress } from './isMyAddress';
import { loadAccounts } from './secureStore';
import { useWallet, type Unlock } from './walletStore';

const K_WHITELIST = 'kalyx.whitelist';
const TIME_CHAINS = ['ethereum', 'base', 'arbitrum'];
const TIME_TTL_MS = 60_000;

/** Horloge monotone (indépendante de l'heure réglée sur le téléphone). */
const mono = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
let anchor: { chain: number; mono: number } | null = null;

/** Oublie l'ancre d'heure : la prochaine lecture repart de la chaîne (changement de réseau, tests). */
export function resetChainClock(): void {
  anchor = null;
}

/** Heure de CHAÎNE (ms), ou null si aucun réseau ne répond. */
export async function chainNow(): Promise<number | null> {
  if (anchor && mono() - anchor.mono < TIME_TTL_MS) return anchor.chain + (mono() - anchor.mono);
  const known = new Set(listChains().map((c) => c.id));
  for (const id of TIME_CHAINS) {
    if (!known.has(id)) continue;
    const a = getAdapter(id);
    if (!(a instanceof EvmChainAdapter)) continue;
    try {
      const t = await a.getLatestBlockTime();
      anchor = { chain: t, mono: mono() };
      return t;
    } catch {
      /* réseau suivant */
    }
  }
  // Ancre plus ancienne mais connue : toujours mieux que l'heure du téléphone.
  return anchor ? anchor.chain + (mono() - anchor.mono) : null;
}

export const useWhitelist = create<{ wl: WhitelistState; loaded: boolean }>(() => ({ wl: EMPTY_WHITELIST, loaded: false }));

export async function loadWhitelist(): Promise<WhitelistState> {
  const st = useWhitelist.getState();
  if (st.loaded) return st.wl;
  let raw: string | null;
  try {
    raw = await kvGet(K_WHITELIST);
  } catch {
    raw = '{illisible'; // trousseau muet : traité comme un fichier abîmé (protection ACTIVE, jamais éteinte)
  }
  const wl = parseWhitelist(raw);
  useWhitelist.setState({ wl, loaded: true });
  return wl;
}

async function save(wl: WhitelistState): Promise<void> {
  await kvSet(K_WHITELIST, JSON.stringify(wl));
  useWhitelist.setState({ wl, loaded: true });
}

/** Modifications en file : jamais deux écritures croisées. */
let queue: Promise<unknown> = Promise.resolve();
function mutate(fn: (wl: WhitelistState, now: number | null) => WhitelistState | Promise<WhitelistState>): Promise<void> {
  const run = queue.catch(() => {}).then(async () => {
    const now = await chainNow();
    const cur = whitelistSettle(await loadWhitelist(), now);
    await save(await fn(cur, now));
  });
  queue = run;
  return run;
}

/** Heure de chaîne EXIGÉE pour démarrer un délai : sans elle, l'heure du téléphone le raccourcirait. */
function needNow(now: number | null): number {
  if (now == null) throw new WalletError('RPC_UNAVAILABLE', 'Heure du réseau indisponible : réessaie dans un instant.');
  return now;
}

export const whitelistActions = {
  enable: (unlock: Unlock) =>
    mutate(async (wl) => {
      await useWallet.getState().verifyUnlock(unlock);
      return whitelistEnable(wl);
    }),
  add: (address: string, label: string, unlock: Unlock) =>
    mutate(async (wl, now) => {
      await useWallet.getState().verifyUnlock(unlock);
      return whitelistAdd(wl, address, label, needNow(now), addressKey);
    }),
  remove: (address: string) => mutate((wl) => whitelistRemove(wl, address, addressKey)),
  requestDisable: (unlock: Unlock) =>
    mutate(async (wl, now) => {
      await useWallet.getState().verifyUnlock(unlock);
      return whitelistRequestDisable(wl, needNow(now));
    }),
  /** Annuler une désactivation demandée = réactiver : renforce, sans code. */
  cancelDisable: () => mutate((wl) => (wl.enabled ? whitelistEnable(wl) : wl)),
  /** Réinitialisation de l'app : la liste part avec les portefeuilles. */
  wipe: async () => {
    await kvDel(K_WHITELIST).catch(() => {});
    useWhitelist.setState({ wl: EMPTY_WHITELIST, loaded: true });
  },
};

/** Comptes de l'utilisateur (portefeuilles À CLÉ — une adresse suivie n'est pas à lui). */
async function ownIndex() {
  const st = useWallet.getState();
  const list = await Promise.all(
    st.wallets
      .filter((w) => w.type !== 'watch')
      .map(async (w) => ({ walletId: w.id, accounts: (w.id === st.activeWalletId ? st.accounts : await loadAccounts(w.id)) ?? [] })),
  );
  return buildAddressIndex(list);
}

/**
 * VERROU d'envoi — appelé par le magasin avant de signer. Lève NOT_WHITELISTED
 * ou WHITELIST_PENDING (avec l'heure d'activation en `meta`) ; sinon ne fait rien.
 */
export async function assertRecipientAllowed(to: string): Promise<void> {
  const wl = await loadWhitelist();
  if (!wl.enabled) return;
  const now = await chainNow();
  if (!whitelistEnforced(wl, now)) return;
  const own = await ownIndex();
  const v = checkRecipient(wl, to, now, addressKey, (a) => !!lookupAddress(own, a));
  if (v.kind === 'blocked') throw new WalletError('NOT_WHITELISTED', 'Destinataire absent de la liste blanche');
  if (v.kind === 'pending') {
    const hours = now == null ? '24' : String(Math.max(1, Math.ceil((v.activeAt - now) / 3_600_000)));
    throw new WalletError('WHITELIST_PENDING', 'Destinataire dans son délai de sûreté', { activeAt: String(v.activeAt), hours });
  }
}
