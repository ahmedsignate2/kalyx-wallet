import { withTimeout } from '../chains/net';
import type { ChainConfig } from '../chains/types';
import type { NftItem } from './alchemyNft';

const TIMEOUT = 15_000;

export async function getSolanaNfts(chain: ChainConfig, address: string): Promise<NftItem[]> {
  const rpc = chain.rpcUrls.find((u) => u.includes('helius-rpc.com') || u.includes('api.mainnet-beta.solana.com') || u.includes('ankr.com'));
  if (!rpc) return [];
  
  try {
    const payload = {
      jsonrpc: '2.0',
      id: 'my-id',
      method: 'getAssetsByOwner',
      params: {
        ownerAddress: address,
        page: 1,
        limit: 100,
        displayOptions: {
            showFungible: false, // only NFTs
            showNativeBalance: false,
        },
      },
    };

    const res = await withTimeout(
      fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
      TIMEOUT,
      () => new Error('timeout')
    );

    const json = await res.json();
    if (!json.result || !json.result.items) return [];

    return json.result.items.map((item: any) => ({
      contract: item.id || '', // On Solana, the mint address is the ID
      tokenId: item.id || '',
      name: item.content?.metadata?.name || 'Solana NFT',
      collection: item.grouping?.find((g: any) => g.group_key === 'collection')?.group_value || '',
      image: item.content?.links?.image || item.content?.files?.[0]?.uri || '',
    })).filter((n: NftItem) => n.contract && n.image);
  } catch (e) {
    console.warn('[Solana NFT] Fetch failed', e);
    return [];
  }
}
