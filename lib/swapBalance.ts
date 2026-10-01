/**
 * Solde d'un jeton source pour le swap — UNE seule lecture pour toutes les
 * familles, qui LÈVE en cas d'échec (jamais un 0 inventé : « Disponible : 0 »
 * sur un compte plein faisait refuser l'échange pour fonds insuffisants).
 *
 *  - natif : solde du compte ;
 *  - EVM : balanceOf ;
 *  - Solana : comptes SPL du propriétaire ;
 *  - TON : jettons listés par l'adaptateur v2.
 * Un jeton absent d'une liste LUE avec succès vaut 0 — c'est alors un fait.
 */
import { EvmChainAdapter, SolanaChainAdapter, getAdapter, getAdapterV2 } from '../src';

export async function readSwapBalance(chainId: string, owner: string, token: string, native: boolean): Promise<bigint> {
  const a = getAdapter(chainId);
  if (native) return (await a.getBalance(owner)).raw;
  const t = token.toLowerCase();
  if (a instanceof EvmChainAdapter) return a.getTokenBalance(token, owner);
  if (a instanceof SolanaChainAdapter) return (await a.getSplTokens(owner)).find((x) => x.mint.toLowerCase() === t)?.raw ?? 0n;
  const v2 = getAdapterV2(chainId);
  if (v2.listTokens) return (await v2.listTokens(owner)).find((x) => String(x.id).toLowerCase() === t)?.raw ?? 0n;
  throw new Error(`Solde de jeton illisible sur ${chainId}`);
}

/** Clé d'un solde : réseau + compte + jeton. Toutes les étiquettes passent par ici. */
export function swapBalanceKey(chainId: string, owner: string | undefined, token: string): string {
  return `${chainId}:${owner ?? ''}:${token.toLowerCase()}`;
}

export type BalanceEntry = { status: 'loading' } | { status: 'ok'; raw: bigint } | { status: 'error' };

/** Disponible pour l'échange : solde − réserve de frais (natif) ; null si l'un des deux est inconnu. */
export function availableFrom(entry: BalanceEntry | undefined, native: boolean, reserve: bigint | null): bigint | null {
  if (!entry || entry.status !== 'ok') return null;
  if (!native) return entry.raw;
  if (reserve == null) return null;
  return entry.raw > reserve ? entry.raw - reserve : 0n;
}
