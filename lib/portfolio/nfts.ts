/**
 * NFT AGRÉGÉS multi-chaîne (§4.1 NFT) : Alchemy sur les réseaux couverts (spam
 * écarté via `contract.isSpam`) + Solana. Chaque NFT porte sa chaîne (badge).
 * Miniatures = URLs déjà converties par le fournisseur (jamais de WebView, jamais
 * de lien tiré d'une description).
 */
import { getAdapter, listChains, getNfts, getSolanaNfts, type NftItem } from '../../src';

export interface ChainNft extends NftItem {
  chainId: string;
}

export async function loadAllNfts(acct: { evmAddress: string; solAddress?: string }): Promise<ChainNft[]> {
  const chains = listChains({ includeTestnets: false });
  const evm = chains.filter((c) => c.family === 'evm' && c.rpcUrls.some((u) => u.includes('.alchemy.com')));
  const parts = await Promise.all([
    ...evm.map(async (c) => {
      try {
        return (await getNfts(c, acct.evmAddress)).map((n) => ({ ...n, chainId: c.id }));
      } catch {
        return [] as ChainNft[];
      }
    }),
    (async () => {
      if (!acct.solAddress) return [] as ChainNft[];
      try {
        return (await getSolanaNfts(getAdapter('solana').config, acct.solAddress)).map((n) => ({ ...n, chainId: 'solana' }));
      } catch {
        return [] as ChainNft[];
      }
    })(),
  ]);
  return parts.flat();
}
