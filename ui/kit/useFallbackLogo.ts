/**
 * Logo d'un jeton quand l'indexeur (Alchemy, RPC) n'en donne pas.
 *
 * Sur l'accueil, USDC sur BNB, AAVE ou WETH sur Base s'affichaient en lettre
 * pastel : l'indexeur ne fournit pas toujours d'image. La liste curée du réseau
 * (celle du swap, LI.FI / Jupiter) en a presque toujours une : on la consulte,
 * une fois par réseau. Le monogramme reste le dernier recours.
 */
import { useEffect } from 'react';
import { useTokenStore } from '../../lib/tokenStore';
import { findAdapterV2 } from '../../src';

export function useFallbackLogo(chainId: string | undefined, address: string | undefined, primary?: string | null): string | undefined {
  const fetchTokens = useTokenStore((s) => s.fetchTokens);
  const list = useTokenStore((s) => (chainId ? s.tokensByChain[chainId] : undefined));
  const family = chainId ? findAdapterV2(chainId)?.config.family : undefined;
  const need = !primary && !!chainId && !!address && address !== chainId && (family === 'evm' || family === 'solana');
  useEffect(() => {
    if (need && !list) fetchTokens(chainId!).catch(() => {});
  }, [need, list, chainId, fetchTokens]);
  if (primary) return primary;
  if (!need || !list) return undefined;
  const a = address!.toLowerCase();
  return list.find((tk) => tk.address.toLowerCase() === a)?.logo || undefined;
}

/**
 * Logo et pastille réseau d'un avoir, partout pareil (accueil, envoi).
 *
 * Le logo est celui du JETON. Le réseau va en pastille : pour tout jeton, et pour
 * une pièce native hors de sa chaîne d'origine (ETH sur Base, Arbitrum…). SOL sur
 * Solana n'en a pas besoin. Avant, une pièce native prenait le logo de son
 * réseau : ETH sur Base devenait le carré bleu de Base.
 */
export function holdingIcon(
  h: { kind: string; chainId: string; logo?: string | null },
  chain: { nativeSymbol: string; coingeckoId?: string },
  chainLogo: string | null | undefined,
): { logo: string | null | undefined; badge: string | null | undefined } {
  if (h.kind !== 'native') return { logo: h.logo, badge: chainLogo };
  const awayFromHome = chain.nativeSymbol === 'ETH' && h.chainId !== 'ethereum';
  return { logo: h.logo || chainLogo, badge: awayFromHome ? chainLogo : null };
}
