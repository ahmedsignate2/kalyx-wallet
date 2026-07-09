/**
 * NFT détenus via l'Alchemy NFT API (REST). Lecture seule : aucune clé privée,
 * aucune signature. Nécessite une clé Alchemy (endpoint *.alchemy.com dans les
 * RPC de la chaîne) ; sinon renvoie [] proprement. Spam exclu côté Alchemy.
 */
import { withTimeout } from '../chains/net';
import type { ChainConfig } from '../chains/types';

const TIMEOUT = 12_000;

export interface NftItem {
  contract: string;
  tokenId: string;
  name: string;
  collection: string;
  image: string;
}

interface RawNft {
  contract?: { address?: string; name?: string; isSpam?: boolean };
  collection?: { name?: string };
  tokenId?: string;
  name?: string;
  image?: { cachedUrl?: string; thumbnailUrl?: string; pngUrl?: string; originalUrl?: string };
}

export function parseNfts(json: unknown): NftItem[] {
  const list = (json as { ownedNfts?: RawNft[] })?.ownedNfts;
  if (!Array.isArray(list)) return [];
  return list
    // Filtrage anti-spam CÔTÉ CLIENT : le paramètre serveur `excludeFilters[]=SPAM`
    // est réservé au plan payant Alchemy (403 sur plan gratuit → 0 NFT affiché).
    // Le champ `contract.isSpam` est fourni gratuitement dans `withMetadata`.
    .filter((n) => !n?.contract?.isSpam)
    .map((n) => ({
      contract: n?.contract?.address ?? '',
      tokenId: String(n?.tokenId ?? ''),
      name: n?.name || n?.contract?.name || (n?.tokenId ? `#${n.tokenId}` : 'NFT'),
      collection: n?.contract?.name || n?.collection?.name || '',
      image:
        n?.image?.cachedUrl ||
        n?.image?.thumbnailUrl ||
        n?.image?.pngUrl ||
        n?.image?.originalUrl ||
        '',
    }))
    .filter((n) => n.contract && n.image); // on n'affiche que les NFT avec image
}

/** Dérive l'URL NFT API depuis l'URL RPC Alchemy (v2 -> nft/v3). */
function nftBaseUrl(chain: ChainConfig): string | undefined {
  const rpc = chain.rpcUrls.find((u) => u.includes('.alchemy.com'));
  if (!rpc) return undefined;
  const m = rpc.match(/^(https:\/\/[^/]+)\/v2\/(.+)$/);
  return m ? `${m[1]}/nft/v3/${m[2]}` : undefined;
}

export async function getNfts(chain: ChainConfig, address: string): Promise<NftItem[]> {
  const base = nftBaseUrl(chain);
  if (!base) return [];
  try {
    const res = await withTimeout(
      // Pas de `excludeFilters[]=SPAM` ni `spamConfidenceLevel` : réservés au plan
      // payant Alchemy (403 sinon). Le spam est écarté côté client via `isSpam`
      // (cf. parseNfts). pageSize=100 (max) pour dépasser les airdrops spam.
      fetch(`${base}/getNFTsForOwner?owner=${address}&withMetadata=true&pageSize=100`),
      TIMEOUT,
      () => new Error('timeout'),
    );
    return parseNfts(await res.json());
  } catch {
    return [];
  }
}
