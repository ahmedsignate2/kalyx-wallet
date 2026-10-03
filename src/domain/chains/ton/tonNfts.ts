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
import { Buffer } from 'buffer';
import { Address, beginCell, comment as commentCell, type Cell } from '@ton/core';
import { formatTonAddress, parseRawTonAddress, parseTonAddress } from './tonAddress';

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

/** Opcode `transfer` d'un élément NFT (TEP-62). */
export const NFT_TRANSFER_OP = 0x5fcc3d14;
/**
 * TON joint au transfert d'un NFT : le gaz de l'élément NFT et la
 * notification au nouveau propriétaire. Valeur de Tonkeeper ; l'excédent
 * revient par `response_destination`.
 */
export const NFT_TRANSFER_TON = 50_000_000n;

/**
 * Corps `transfer` TEP-62, envoyé à l'ÉLÉMENT NFT par son propriétaire :
 *   transfer#5fcc3d14 query_id:uint64 new_owner:MsgAddress
 *     response_destination:MsgAddress custom_payload:(Maybe ^Cell)
 *     forward_amount:Coins forward_payload:(Either Cell ^Cell)
 * Vérifié contre des transferts réels (`ton-nft-transfer-vectors.json`).
 */
export function nftTransferBody(p: { newOwner: string; responseTo: string; queryId: bigint; forwardTon?: bigint; comment?: string; testnet?: boolean }): Cell {
  if (p.queryId < 0n || p.queryId >= 1n << 64n) throw new Error('query_id hors limites');
  return beginCell()
    .storeUint(NFT_TRANSFER_OP, 32)
    .storeUint(p.queryId, 64)
    .storeAddress(tonAddressOf(p.newOwner, !!p.testnet))
    .storeAddress(tonAddressOf(p.responseTo, !!p.testnet))
    .storeBit(0) // pas de custom_payload
    .storeCoins(p.forwardTon ?? 1n)
    .storeMaybeRef(p.comment ? commentCell(p.comment) : null)
    .endCell();
}

function tonAddressOf(address: string, testnet: boolean): Address {
  const friendly = parseTonAddress(address);
  if (friendly) {
    if (friendly.testnet && !testnet) throw new Error('Adresse TON du réseau de test : refusée sur le réseau principal');
    return new Address(friendly.workchain, Buffer.from(friendly.hash));
  }
  const raw = parseRawTonAddress(address.toLowerCase());
  if (raw) return new Address(raw.workchain, Buffer.from(raw.hash));
  throw new Error('Adresse TON invalide');
}
