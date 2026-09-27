/**
 * NFT AGRÉGÉS multi-chaîne (§4.1 NFT) : Alchemy sur les réseaux couverts (spam
 * écarté via `contract.isSpam`) + Solana. Chaque NFT porte sa chaîne (badge).
 * Miniatures = URLs déjà converties par le fournisseur (jamais de WebView, jamais
 * de lien tiré d'une description).
 */
import { getAdapter, listChains, getNfts, getSolanaNfts, findAdapterV2, TonAdapterV2, type NftItem } from '../../src';
import { addressForChain, type AccountAddresses } from '../accountAddress';

export interface ChainNft extends NftItem {
  chainId: string;
}

export async function loadAllNfts(acct: AccountAddresses & { evmAddress: string }): Promise<ChainNft[]> {
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
    // TON : NFT et domaines .ton, par TonAPI (arnaques écartées dans `parseTonNfts`).
    ...chains.filter((c) => c.family === 'ton').map(async (c) => {
      const address = addressForChain(acct, c);
      const a = address ? findAdapterV2(c.id) : undefined;
      if (!address || !(a instanceof TonAdapterV2)) return [] as ChainNft[];
      try {
        return (await a.nfts(address)).map((n) => ({
          contract: n.collection || n.address,
          tokenId: n.address,
          name: n.name,
          collection: n.collectionName,
          image: n.image,
          url: c.explorerUrl ? `${c.explorerUrl}/nft/${n.address}` : undefined,
          chainId: c.id,
        }));
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
