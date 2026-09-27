/**
 * NFT Solana par l'API DAS (`getAssetsByOwner`).
 *
 * Réécrit après relevé réel (`helius-das-live.json`) :
 *   - DAS n'existe que chez Helius (et quelques fournisseurs) ; le RPC public
 *     Solana et Ankr la refusent. L'erreur était avalée et l'écran affirmait
 *     « aucun NFT ». Sans fournisseur DAS, on le DIT (`NftUnavailableError`) ;
 *   - la « collection » affichée était l'adresse brute du groupe, en base58 ;
 *     on prend son nom (`showCollectionMetadata`) ;
 *   - l'image d'origine (ipfs, arweave, SVG) passe par l'aperçu en cache de
 *     Helius (`cdn_uri`) ;
 *   - le spam — plus de la moitié du relevé — est écarté (`nftSpam.ts`).
 */
import { withTimeout } from '../chains/net';
import type { ChainConfig } from '../chains/types';
import { displayableImage, type NftItem } from './alchemyNft';
import { isSpamNft } from './nftSpam';

const TIMEOUT = 15_000;

/** Aucun fournisseur capable de lister les NFT de ce réseau (clé absente). */
export class NftUnavailableError extends Error {
  constructor(chain: string) {
    super(`nft-unavailable:${chain}`);
    this.name = 'NftUnavailableError';
  }
}

interface DasAsset {
  id?: string;
  burnt?: boolean;
  compression?: { compressed?: boolean };
  grouping?: { group_key?: string; group_value?: string; collection_metadata?: { name?: string | null } }[];
  content?: { metadata?: { name?: string | null }; links?: { image?: string | null }; files?: { uri?: string; cdn_uri?: string; mime?: string }[] };
}

export function parseDasNfts(json: unknown): NftItem[] {
  const items = (json as { result?: { items?: DasAsset[] } } | null)?.result?.items;
  if (!Array.isArray(items)) return [];
  const out: NftItem[] = [];
  for (const a of items) {
    if (!a?.id || a.burnt) continue;
    const name = (a.content?.metadata?.name ?? '').trim();
    const group = a.grouping?.find((g) => g.group_key === 'collection');
    const collection = (group?.collection_metadata?.name ?? '').trim();
    if (isSpamNft({ name, collection, compressed: !!a.compression?.compressed })) continue;
    const file = a.content?.files?.[0];
    const image = file?.cdn_uri || displayableImage(a.content?.links?.image || file?.uri || '');
    if (!name && !image) continue;
    out.push({
      contract: group?.group_value || a.id,
      tokenId: a.id,
      name: name || collection || `${a.id.slice(0, 4)}…${a.id.slice(-4)}`,
      collection,
      image,
      url: `https://solscan.io/token/${a.id}`,
    });
  }
  return out;
}

export async function getSolanaNfts(chain: ChainConfig, address: string): Promise<NftItem[]> {
  const rpc = chain.rpcUrls.find((u) => u.includes('helius-rpc.com'));
  if (!rpc) throw new NftUnavailableError(chain.id);
  const res = await withTimeout(
    fetch(rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'kalyx-nfts',
        method: 'getAssetsByOwner',
        params: { ownerAddress: address, page: 1, limit: 100, displayOptions: { showFungible: false, showCollectionMetadata: true } },
      }),
    }),
    TIMEOUT,
    () => new Error('timeout'),
  );
  const json = (await res.json()) as { result?: unknown; error?: { message?: string } };
  if (!json?.result) throw new Error(`DAS: ${json?.error?.message ?? res.status}`);
  return parseDasNfts(json);
}
