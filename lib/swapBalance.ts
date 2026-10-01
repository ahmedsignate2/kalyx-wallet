/**
 * Solde d'un jeton source pour le swap — UNE seule lecture pour toutes les
 * familles, qui LÈVE en cas d'échec (jamais un 0 inventé : « Disponible : 0 »
 * sur un compte plein faisait refuser l'échange pour fonds insuffisants).
 *
 *  - natif : solde du compte ;
 *  - EVM : balanceOf strict (réponse vide ou illisible = erreur) ;
 *  - Solana : comptes SPL du propriétaire ;
 *  - TON : jettons listés par l'adaptateur v2.
 * Un jeton absent d'une liste LUE avec succès vaut 0 — c'est alors un fait.
 */
import { EvmChainAdapter, SolanaChainAdapter, getAdapter, getAdapterV2, normalizeAddressCase } from '../src';

export async function readSwapBalance(chainId: string, owner: string, token: string, native: boolean): Promise<bigint> {
  const a = getAdapter(chainId);
  if (native) return (await a.getBalance(owner)).raw;
  const t = token.toLowerCase();
  if (a instanceof EvmChainAdapter) return a.getTokenBalanceStrict(token, owner);
  if (a instanceof SolanaChainAdapter) {
    /*
     * Lecture DIRECTE des comptes de ce mint : `getSplTokens` avale ses erreurs
     * RPC et rend [] — un échec y devenait un faux 0 (« Disponible : 0 » sur un
     * compte plein). Ici l'erreur remonte. Plus léger aussi : un seul appel,
     * sans métadonnées. Le filtre par mint couvre SPL et Token-2022.
     */
    const res = await a.rpc<{ value?: { account?: { data?: { parsed?: { info?: { tokenAmount?: { amount?: string } } } } } }[] }>(
      'getTokenAccountsByOwner',
      [owner, { mint: token }, { encoding: 'jsonParsed', commitment: 'confirmed' }],
    );
    if (!res || !Array.isArray(res.value)) throw new Error('Réponse Solana illisible');
    return res.value.reduce((sum, acc) => sum + BigInt(acc.account?.data?.parsed?.info?.tokenAmount?.amount ?? '0'), 0n);
  }
  const v2 = getAdapterV2(chainId);
  if (v2.listTokens) return (await v2.listTokens(owner)).find((x) => String(x.id).toLowerCase() === t)?.raw ?? 0n;
  throw new Error(`Solde de jeton illisible sur ${chainId}`);
}

/** Clé d'un solde : réseau + compte + jeton. Toutes les étiquettes passent par ici. */
export function swapBalanceKey(chainId: string, owner: string | undefined, token: string): string {
  // Règle de casse unique (addressCase) : ignorée pour EVM et TON brut, gardée pour un mint Solana.
  return `${chainId}:${owner ?? ''}:${normalizeAddressCase(token)}`;
}

/** `at` : moment de la lecture (ms) — une valeur trop vieille est relue au retour sur le jeton. */
export type BalanceEntry = { status: 'loading' } | { status: 'ok'; raw: bigint; at: number } | { status: 'error' };

/** Au-delà, un solde déjà lu est relu quand on revient sur le jeton. */
export const BALANCE_TTL_MS = 30_000;

/** Faut-il (re)lire ce solde ? Absent, en erreur, ou trop vieux. */
export function needsRead(entry: BalanceEntry | undefined, now: number): boolean {
  if (!entry || entry.status === 'error') return true;
  return entry.status === 'ok' && now - entry.at > BALANCE_TTL_MS;
}

/** Disponible pour l'échange : solde − réserve de frais (natif) ; null si l'un des deux est inconnu. */
export function availableFrom(entry: BalanceEntry | undefined, native: boolean, reserve: bigint | null): bigint | null {
  if (!entry || entry.status !== 'ok') return null;
  if (!native) return entry.raw;
  if (reserve == null) return null;
  return entry.raw > reserve ? entry.raw - reserve : 0n;
}
