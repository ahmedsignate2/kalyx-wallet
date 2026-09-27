/**
 * TON — NFT et noms de domaine (TON DNS).
 *
 * ## NFT (`/v2/accounts/{a}/nfts`)
 *
 * Forme relevée le 27/09 (`tonapi-nfts-live.json`) sur un vrai compte : la
 * moitié de ses NFT sont des ARNAQUES — « 1,000,000 NOT Voucher », « 6,515 USDT
 * Bonus », « 873TON💎Voucher🔐 » —, envoyés sans rien demander pour attirer vers
 * un site de vol. Deux signaux suffisent à les écarter sans perdre les vrais :
 * `trust: "blacklist"`, et l'ABSENCE de collection (un « bon » isolé, sans
 * collection, est la forme typique de l'arnaque). Un domaine `.ton` est
 * toujours gardé : il appartient à la collection officielle TON DNS.
 *
 * ## Noms (`/v2/dns/{nom}/resolve`)
 *
 * `wallet.address` (brute) = le portefeuille désigné par le nom ; 404
 * « entity not found » = nom inexistant.
 */
import { formatTonAddress, parseRawTonAddress } from './tonAddress';

export interface TonNft {
  /** Adresse de l'élément NFT (brute). */
  address: string;
  /** Adresse de la collection (brute), vide si aucune. */
  collection: string;
  collectionName: string;
  name: string;
  /** Aperçu 500×500, en PNG. */
  image: string;
  /** Nom de domaine si l'élément en est un (« kalyx.ton »). */
  dns?: string;
}

/** Aperçu WebP de TonAPI → PNG (React Native ne décode pas le WebP sur iOS). */
function png(url: string | undefined, size: number): string {
  if (!url || !/^https:\/\//.test(url)) return '';
  return `https://wsrv.nl/?url=${encodeURIComponent(url.replace(/^https:\/\//, ''))}&output=png&w=${size}&h=${size}&fit=cover`;
}

export function parseTonNfts(json: unknown): TonNft[] {
  const items = (json as { nft_items?: unknown[] } | null)?.nft_items;
  if (!Array.isArray(items)) return [];
  const out: TonNft[] = [];
  for (const n of items as any[]) {
    if (typeof n?.address !== 'string') continue;
    if (n.trust === 'blacklist' || n.owner?.is_scam === true) continue;
    const dns = typeof n.dns === 'string' && n.dns ? n.dns : undefined;
    const collection = typeof n.collection?.address === 'string' ? n.collection.address : '';
    if (!collection && !dns) continue;
    const preview = (n.previews as { resolution?: string; url?: string }[] | undefined)?.find((p) => p.resolution === '500x500')?.url;
    out.push({
      address: n.address,
      collection,
      collectionName: String(n.collection?.name ?? (dns ? 'TON DNS' : '')).slice(0, 80),
      name: String(dns ?? n.metadata?.name ?? '').slice(0, 120) || '—',
      image: png(preview ?? n.metadata?.image, 500),
      dns,
    });
  }
  return out;
}

/** « Kalyx.TON » → « kalyx.ton » si c'est un nom TON DNS plausible, sinon null. */
export function normalizeTonDomain(input: string): string | null {
  const s = input.trim().toLowerCase();
  return /^(?:[a-z0-9-]{1,63}\.){1,4}(?:ton|t\.me)$/.test(s) && !s.includes('..') ? s : null;
}

/** Réponse de résolution → adresse conviviale NON rebondissante, ou null. */
export function parseDnsWallet(json: unknown, testnet: boolean): string | null {
  const raw = (json as { wallet?: { address?: string } } | null)?.wallet?.address;
  const a = typeof raw === 'string' ? parseRawTonAddress(raw.toLowerCase()) : null;
  return a ? formatTonAddress(a, { bounceable: false, testnet }) : null;
}
