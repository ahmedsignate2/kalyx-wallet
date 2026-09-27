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
  /** Page de l'explorateur, quand la chaîne n'a pas le format `/token/{contrat}?a={id}` (TON). */
  url?: string;
}

interface RawNft {
  contract?: { address?: string; name?: string; isSpam?: boolean };
  collection?: { name?: string };
  tokenId?: string;
  name?: string;
  image?: { cachedUrl?: string; thumbnailUrl?: string; pngUrl?: string; originalUrl?: string };
}

/**
 * URL affichable par React Native : `ipfs://` passe par une passerelle, et un
 * SVG (les Basenames, beaucoup de noms on-chain) est converti en PNG — `Image`
 * ne décode pas le SVG et laissait une case vide.
 */
export function displayableImage(url: string): string {
  let u = url.trim();
  if (!u) return '';
  if (u.startsWith('http://')) u = `https://${u.slice(7)}`;
  if (u.startsWith('ipfs://')) u = `https://ipfs.io/ipfs/${u.slice(7).replace(/^ipfs\//, '')}`;
  if (u.startsWith('data:image/svg') || /\.svg(?:[?#]|$)/i.test(u)) {
    if (u.startsWith('data:')) return '';
    return `https://wsrv.nl/?url=${encodeURIComponent(u.replace(/^https?:\/\//, ''))}&output=png&w=500&h=500&fit=contain`;
  }
  return /^https:\/\//.test(u) || u.startsWith('data:image/') ? u : '';
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
      image: displayableImage(
        n?.image?.cachedUrl ||
        n?.image?.pngUrl ||
        n?.image?.thumbnailUrl ||
        n?.image?.originalUrl ||
        '',
      ),
      named: !!(n?.name || n?.contract?.name),
    }))
    // Sans image, un NFT reste montré (case avec icône) s'il a au moins un nom :
    // un Basename tout juste frappé n'a parfois pas encore d'aperçu chez Alchemy.
    .filter((n) => n.contract && (n.image || n.named))
    .map(({ named: _named, ...n }) => n);
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
