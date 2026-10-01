/**
 * Solde d'un jeton source pour le swap — UNE seule lecture pour toutes les
 * familles, qui LÈVE en cas d'échec (jamais un 0 inventé : « Disponible : 0 »
 * sur un compte plein faisait refuser l'échange pour fonds insuffisants).
 *
 *  - natif : solde du compte ;
 *  - EVM : balanceOf strict (réponse vide ou illisible = erreur) ;
 *  - Solana : comptes SPL du propriétaire ;
 *  - TON : jettons listés par l'adaptateur v2 (TonAPI lève sur erreur HTTP).
 * Un jeton absent d'une liste LUE avec succès vaut 0 — c'est alors un fait.
 */
import { EvmChainAdapter, SolanaChainAdapter, getAdapter, getAdapterV2, normalizeAddressCase } from '../src';
import { withTimeout } from '../src/domain/chains/net';

/** Lecture bornée à 15 s : un RPC qui ne répond pas devient une erreur, jamais une attente sans fin. */
export function readSwapBalance(chainId: string, owner: string, token: string, native: boolean): Promise<bigint> {
  return withTimeout(readOnce(chainId, owner, token, native), BALANCE_READ_TIMEOUT_MS, () => new Error('Lecture du solde trop longue'));
}

async function readOnce(chainId: string, owner: string, token: string, native: boolean): Promise<bigint> {
  const a = getAdapter(chainId);
  if (native) return (await a.getBalance(owner)).raw;
  if (a instanceof EvmChainAdapter) return a.getTokenBalanceStrict(token, owner);
  // Pas `getSplTokens` : il rend une liste partielle sur erreur RPC (un faux 0 ici).
  if (a instanceof SolanaChainAdapter) return a.getSplTokenBalanceStrict(owner, token);
  const v2 = getAdapterV2(chainId);
  if (v2.listTokens) return (await v2.listTokens(owner)).find((x) => normalizeAddressCase(String(x.id)) === normalizeAddressCase(token))?.raw ?? 0n;
  throw new Error(`Solde de jeton illisible sur ${chainId}`);
}

/** Clé d'un solde : réseau + compte + jeton. Toutes les étiquettes passent par ici. */
export function swapBalanceKey(chainId: string, owner: string | undefined, token: string): string {
  // Règle de casse unique (addressCase) : ignorée pour EVM et TON brut, gardée pour un mint Solana.
  return `${chainId}:${owner ?? ''}:${normalizeAddressCase(token)}`;
}

/** `at` : moment de la lecture (ms) — une valeur trop vieille est relue au retour sur le jeton. */
/** `afterSwap` : solde d'avant un échange diffusé, masqué le temps qu'il soit miné. */
export type BalanceEntry = { status: 'loading'; since: number; afterSwap?: true } | { status: 'ok'; raw: bigint; at: number } | { status: 'error' };

/** Au-delà, un solde déjà lu est relu (retour sur le jeton, relecture périodique). */
export const BALANCE_TTL_MS = 30_000;
/** Durée maximale d'une lecture : au-delà, l'appelant la tient pour échouée. */
export const BALANCE_READ_TIMEOUT_MS = 15_000;
/** Un « en cours » plus vieux que ça n'a plus de lecture derrière lui. */
const LOADING_STALE_MS = 20_000;

/**
 * Faut-il (re)lire ce solde ? Absent, en erreur, trop vieux — ou « en cours »
 * depuis trop longtemps (aucune lecture ne dure plus de 15 s : c'est une
 * attente orpheline, par ex. après un échange en attente de confirmation).
 */
export function needsRead(entry: BalanceEntry | undefined, now: number): boolean {
  if (!entry || entry.status === 'error') return true;
  if (entry.status === 'loading') return now - entry.since > LOADING_STALE_MS;
  return now - entry.at > BALANCE_TTL_MS;
}

/**
 * Peut-on écrire une lecture sur cette entrée ? Pas pendant les 20 s qui
 * suivent un échange diffusé : le nœud rend encore le solde d'AVANT, qui serait
 * pris pour frais (« Max » sur des fonds déjà partis).
 */
export function writable(entry: BalanceEntry | undefined, now: number): boolean {
  return !(entry?.status === 'loading' && entry.afterSwap && now - entry.since <= LOADING_STALE_MS);
}

/** Solde lu et encore frais (≤ 30 s), sinon null : à relire avant de juger les fonds. */
export function freshRaw(entry: BalanceEntry | undefined, now: number): bigint | null {
  return entry?.status === 'ok' && !needsRead(entry, now) ? entry.raw : null;
}

/** Disponible pour l'échange : solde − réserve de frais (natif) ; null si l'un des deux est inconnu. */
export function availableFrom(entry: BalanceEntry | undefined, native: boolean, reserve: bigint | null): bigint | null {
  if (!entry || entry.status !== 'ok') return null;
  if (!native) return entry.raw;
  if (reserve == null) return null;
  return entry.raw > reserve ? entry.raw - reserve : 0n;
}
