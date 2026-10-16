/**
 * NFT détenus via l'Alchemy NFT API (REST). Lecture seule : aucune clé privée,
 * aucune signature. Nécessite une clé Alchemy (endpoint *.alchemy.com dans les
 * RPC de la chaîne) ; sinon renvoie [] proprement. Spam exclu côté Alchemy.
 */
import { base64 } from '@scure/base';
import { bytesToUtf8 } from '@noble/hashes/utils';
import { withTimeout } from '../chains/net';
import type { ChainConfig } from '../chains/types';
import { isSpamNft } from './nftSpam';

const TIMEOUT = 12_000;

export interface NftItem {
  contract: string;
  tokenId: string;
  name: string;
  collection: string;
  image: string;
  /** Page de l'explorateur, quand la chaîne n'a pas le format `/token/{contrat}?a={id}` (TON). */
  url?: string;
  /**
   * Images de REPLI, dans l'ordre, si `image` ne se charge pas (lien mort,
   * format que le téléphone ne décode pas). L'écran passe à la suivante.
   */
  images?: string[];
  /** SVG inscrit dans le NFT lui-même (art « on-chain ») : dessiné tel quel, sans réseau. */
  svg?: string;
}

interface RawNft {
  contract?: { address?: string; name?: string; isSpam?: boolean; openSeaMetadata?: { collectionName?: string; imageUrl?: string } };
  collection?: { name?: string };
  tokenId?: string;
  name?: string;
  image?: { cachedUrl?: string | null; thumbnailUrl?: string | null; pngUrl?: string | null; originalUrl?: string | null; contentType?: string | null };
  raw?: { metadata?: { image?: unknown; image_url?: unknown; image_data?: unknown } };
}

/** Basenames (Base) et ENS (Ethereum) : noms personnalisés dont l'image est un SVG généré par leur service. */
const BASENAMES = '0x03c4738ee98ae44591e1a4a4f3cab6641d95dd9a';
const ENS = new Set(['0x57f1887a8bf19b14fc0df6fd9b2acc9af147ea85', '0xd4416b13d2b3a9abae7acd5d6c2bbdbe25686401']);

/** Image du service de noms, quand le fournisseur n'en a pas (nom tout juste frappé). */
export function nameServiceImage(contract: string, tokenId: string, name: string): string {
  const c = contract.toLowerCase();
  if (c === BASENAMES && /^[a-z0-9-]+(\.[a-z0-9-]+)*\.base\.eth$/i.test(name)) {
    return displayableImage(`https://www.base.org/api/basenames/${name.toLowerCase()}/assets/cardImage.svg`);
  }
  if (ENS.has(c) && /^\d+$/.test(tokenId)) {
    return displayableImage(`https://metadata.ens.domains/mainnet/${c}/${tokenId}/image`, true);
  }
  return '';
}

const MAX_SVG = 200_000;

/**
 * SVG inscrit dans le NFT (`data:image/svg+xml…` ou `image_data`) → balisage à
 * dessiner. Écarté s'il est trop lourd ou s'il embarque du script / du HTML.
 */
export function inlineSvg(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let s = raw.trim();
  const m = s.match(/^data:image\/svg\+xml(;[^,]*)?,(.*)$/is);
  if (m) {
    try {
      s = /;base64/i.test(m[1] ?? '') ? decodeBase64Utf8(m[2]) : decodeURIComponent(m[2]);
    } catch {
      return '';
    }
  }
  if (s.length > MAX_SVG || !/^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(s)) return '';
  if (/<script|<foreignObject|\bon[a-z]+\s*=|javascript:/i.test(s)) return '';
  return s;
}

/** base64 → texte UTF-8, avec les bibliothèques du projet : `atob`/`TextDecoder` manquent sur certains moteurs (Hermes/Android). */
function decodeBase64Utf8(b64: string): string {
  return bytesToUtf8(base64.decode(b64.replace(/\s+/g, '')));
}

const uniq = (xs: string[]) => xs.filter((x, i) => x && xs.indexOf(x) === i);

/**
 * Images candidates, dans l'ordre. Un SVG mis en cache par Alchemy a une URL
 * SANS extension (`nft-cdn.alchemy.com/…`) : le téléphone recevait un SVG qu'il
 * ne sait pas décoder — case vide (les Basenames). Pour un SVG, la version PNG
 * d'Alchemy passe donc en premier, et l'original converti ensuite.
 */
export function nftImageCandidates(n: RawNft, name: string): string[] {
  const img = n.image ?? {};
  const isSvg = /svg/i.test(img.contentType ?? '');
  const meta = n.raw?.metadata;
  const metaImage = typeof meta?.image === 'string' ? meta.image : typeof meta?.image_url === 'string' ? meta.image_url : '';
  const ordered = isSvg
    ? [img.pngUrl, img.thumbnailUrl, img.originalUrl && displayableImage(img.originalUrl, true), metaImage && displayableImage(metaImage, true)]
    : [img.cachedUrl, img.thumbnailUrl, img.pngUrl, img.originalUrl, metaImage];
  const list = ordered.map((u) => (u ? displayableImage(u) : ''));
  list.push(nameServiceImage(n.contract?.address ?? '', String(n.tokenId ?? ''), name));
  if (n.contract?.openSeaMetadata?.imageUrl) list.push(displayableImage(n.contract.openSeaMetadata.imageUrl));
  return uniq(list);
}

/**
 * URL affichable par React Native : `ipfs://` passe par une passerelle, et un
 * SVG (les Basenames, beaucoup de noms on-chain) est converti en PNG — `Image`
 * ne décode pas le SVG et laissait une case vide.
 */
export function displayableImage(url: string, svg = false): string {
  let u = url.trim();
  if (!u) return '';
  if (u.startsWith('http://')) u = `https://${u.slice(7)}`;
  if (u.startsWith('ipfs://')) u = `https://ipfs.io/ipfs/${u.slice(7).replace(/^ipfs\//, '')}`;
  if (u.startsWith('ar://')) u = `https://arweave.net/${u.slice(5)}`;
  if (u.startsWith('https://wsrv.nl/')) return u;
  if (u.startsWith('data:image/svg') || svg || /\.svg(?:[?#]|$)/i.test(u)) {
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
    .map((n) => {
      const name = n?.name || n?.contract?.name || n?.contract?.openSeaMetadata?.collectionName || (n?.tokenId ? `#${n.tokenId}` : 'NFT');
      const [image = '', ...images] = nftImageCandidates(n ?? {}, name);
      const svg = inlineSvg(n?.raw?.metadata?.image_data) || inlineSvg(n?.raw?.metadata?.image) || inlineSvg(n?.image?.originalUrl);
      return {
        contract: n?.contract?.address ?? '',
        tokenId: String(n?.tokenId ?? ''),
        name,
        collection: n?.contract?.name || n?.collection?.name || n?.contract?.openSeaMetadata?.collectionName || '',
        image,
        ...(images.length ? { images } : {}),
        ...(svg ? { svg } : {}),
        named: !!(n?.name || n?.contract?.name),
      };
    })
    // Sans image, un NFT reste montré (case avec son nom) s'il a au moins un nom :
    // un Basename tout juste frappé n'a parfois pas encore d'aperçu chez Alchemy.
    .filter((n) => n.contract && (n.image || n.svg || n.named))
    // `isSpam` d'Alchemy en laisse passer : mêmes règles de nom que sur Solana.
    .filter((n) => !isSpamNft({ name: n.name, collection: n.collection }))
    .map(({ named: _named, ...n }) => n);
}

/** Dérive l'URL NFT API depuis l'URL RPC Alchemy (v2 -> nft/v3). */
function nftBaseUrl(chain: ChainConfig): string | undefined {
  const rpc = chain.rpcUrls.find((u) => u.includes('.alchemy.com'));
  if (!rpc) return undefined;
  const m = rpc.match(/^(https:\/\/[^/]+)\/v2\/(.+)$/);
  return m ? `${m[1]}/nft/v3/${m[2]}` : undefined;
}

/** Pages lues au plus (100 NFT chacune) : les airdrops de spam ne doivent plus cacher les vrais. */
const MAX_PAGES = 4;

export async function getNfts(chain: ChainConfig, address: string): Promise<NftItem[]> {
  const base = nftBaseUrl(chain);
  if (!base) return [];
  const out: NftItem[] = [];
  let pageKey: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    // Une page suivante en panne : on garde ce qui est lu plutôt que tout perdre.
    const r = page === 0 ? await getNftPage(base, address) : await getNftPage(base, address, pageKey).catch(() => null);
    if (!r) break;
    out.push(...r.items);
    pageKey = r.pageKey;
    if (!pageKey) break;
  }
  return out;
}

async function getNftPage(base: string, address: string, pageKey?: string): Promise<{ items: NftItem[]; pageKey?: string } | null> {
  const res = await withTimeout(
      // Pas de `excludeFilters[]=SPAM` ni `spamConfidenceLevel` : réservés au plan
      // payant Alchemy (403 sinon). Le spam est écarté côté client via `isSpam`
      // (cf. parseNfts). pageSize=100 (max) ; les pages suivantes via `pageKey`.
      fetch(`${base}/getNFTsForOwner?owner=${address}&withMetadata=true&pageSize=100${pageKey ? `&pageKey=${encodeURIComponent(pageKey)}` : ''}`),
      TIMEOUT,
      () => new Error('timeout'),
    );
  /*
   * Un réseau que l'API NFT ne couvre pas répond 4xx : ce n'est pas une panne,
   * il n'y a simplement rien à lire là. Une panne (5xx, délai) REMONTE : avant,
   * elle devenait une liste vide et l'écran affirmait « aucun NFT ».
   */
  if (res.status >= 400 && res.status < 500 && res.status !== 429) return null;
  if (!res.ok) throw new Error(`Alchemy NFT ${res.status}`);
  const json = (await res.json()) as { pageKey?: unknown };
  return { items: parseNfts(json), pageKey: typeof json?.pageKey === 'string' && json.pageKey ? json.pageKey : undefined };
}
