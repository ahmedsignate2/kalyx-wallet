/**
 * COMPTE DE CARTE ON-CHAIN (émetteurs `topUp: 'onchain'`, c.-à-d. Gnosis Pay).
 *
 * Une carte Gnosis Pay dépense depuis un compte Safe à l'utilisateur, sur
 * Gnosis Chain. Kalyx n'a besoin d'AUCUNE API pour :
 *  - lire le solde de la carte : les stablecoins détenus par ce compte ;
 *  - la recharger : un envoi ordinaire vers ce compte, signé dans Kalyx avec
 *    l'aperçu et l'analyse habituels.
 * L'adresse du compte est collée une fois par l'utilisateur (elle s'affiche
 * dans Gnosis Pay) et vérifiée : bonne forme, et un CONTRAT sur Gnosis Chain —
 * un Safe — jamais une adresse ordinaire, ni une adresse du portefeuille.
 */
import { checkEvmAddress } from '../src/domain/validation/address';
import { getAdapter } from '../src/domain/chains/registry';
import { getErc20TokensStrict } from '../src/domain/tokens/alchemyTokens';
import type { CardIssuer } from '../src/domain/card/cardIssuers';

export type CardAccountCheck =
  | { ok: true; address: string }
  | { ok: false; reason: 'format' | 'ownWallet' | 'notContract' | 'network' };

export interface CardBalanceLine {
  symbol: string;
  contract: string;
  decimals: number;
  amount: number;
}

/** Vérifie l'adresse du compte de la carte, collée par l'utilisateur. */
export async function checkCardAccount(input: string, issuer: CardIssuer, ownAddresses: readonly string[]): Promise<CardAccountCheck> {
  const c = checkEvmAddress(input.trim());
  if (!c.valid || !c.checksummed) return { ok: false, reason: 'format' };
  const address = c.checksummed;
  // Le compte de la carte est un Safe, distinct du portefeuille : coller sa propre adresse est une erreur fréquente.
  if (ownAddresses.some((a) => a.toLowerCase() === address.toLowerCase())) return { ok: false, reason: 'ownWallet' };
  try {
    const adapter = getAdapter(issuer.chainIds[0]) as unknown as { getCode(a: string): Promise<string> };
    const code = await adapter.getCode(address);
    if (!code || code === '0x') return { ok: false, reason: 'notContract' };
  } catch {
    return { ok: false, reason: 'network' };
  }
  return { ok: true, address };
}

/** Solde de la carte : les stablecoins de l'émetteur détenus par son compte. Lève si la lecture échoue. */
export async function cardAccountBalance(address: string, issuer: CardIssuer): Promise<CardBalanceLine[]> {
  const chain = getAdapter(issuer.chainIds[0]).config;
  const tokens = await getErc20TokensStrict(chain, address);
  return tokens
    .filter((t) => issuer.stables.includes(t.symbol.toUpperCase()))
    .map((t) => ({ symbol: t.symbol, contract: t.contract, decimals: t.decimals, amount: Number(t.raw) / 10 ** t.decimals }))
    .filter((t) => Number.isFinite(t.amount) && t.amount > 0);
}
