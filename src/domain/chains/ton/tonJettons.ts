/**
 * TON — jettons (jetons TEP-74) : lecture des soldes et corps de transfert.
 *
 * ## Lecture (TonAPI `/v2/accounts/{a}/jettons`)
 *
 * Forme RELEVÉE le 27/09 (`tonapi-jettons-live.json`) : `balance` en chaîne,
 * `wallet_address.address` = le portefeuille de jeton DE CE COMPTE (brut),
 * `jetton.address` = le contrat maître, `jetton.verification` = `whitelist`,
 * `none` ou `blacklist`, et le prix dans la devise demandée.
 *
 * Le SYMBOLE ne prouve rien : le relevé contient un « USD₮ » en liste noire à
 * côté du vrai, et un « Tethe USD / USDT-GARN » non vérifié reçu sans rien
 * demander. On décide donc par le statut de vérification — `blacklist` écarté,
 * `none` masqué et sans valeur, seul `whitelist` compte.
 *
 * ## Transfert (TEP-74)
 *
 * On n'écrit pas au destinataire : on écrit à SON PROPRE portefeuille de jeton,
 * qui débite et transmet. Le message porte un peu de TON pour le gaz de la
 * chaîne de messages ; l'excédent revient par `response_destination`.
 *
 *   transfer#0f8a7ea5 query_id:uint64 amount:Coins destination:MsgAddress
 *     response_destination:MsgAddress custom_payload:(Maybe ^Cell)
 *     forward_ton_amount:Coins forward_payload:(Either Cell ^Cell)
 */
import { Buffer } from 'buffer';
import { Address, beginCell, comment as commentCell, type Cell } from '@ton/core';
import { parseRawTonAddress, parseTonAddress, formatTonAddress, toRawTonAddress } from './tonAddress';

/** Opcode `transfer` d'un portefeuille de jeton (TEP-74). */
export const JETTON_TRANSFER_OP = 0x0f8a7ea5;
/**
 * TON joint au message de transfert, pour le gaz du portefeuille de jeton, du
 * portefeuille du destinataire (déployé au besoin) et de la notification. La
 * valeur de Tonkeeper ; l'excédent revient à l'expéditeur.
 */
export const JETTON_TRANSFER_TON = 50_000_000n;
/**
 * TON transmis au destinataire avec la notification. Non nul : sans lui, pas de
 * `transfer_notification`, et une plateforme d'échange ne verrait jamais le
 * commentaire du dépôt.
 */
export const JETTON_FORWARD_TON = 1n;

/** Contrat maître du vrai USD₮ sur le réseau principal (Tether). */
export const USDT_TON_MASTER = '0:b113a994b5024a16719f69139328eb759596c38a25f59028b146fecdc3621dfe';

export type JettonVerification = 'whitelist' | 'none' | 'blacklist';

export interface TonJettonBalance {
  /** Contrat maître, adresse BRUTE en minuscules — l'identifiant du jeton. */
  master: string;
  /** Portefeuille de jeton de ce compte, adresse brute — celui qu'on débite. */
  wallet: string;
  symbol: string;
  name: string;
  decimals: number;
  raw: bigint;
  /** Image convertie en PNG (le WebP de TonAPI ne s'affiche pas partout). */
  image?: string;
  verification: JettonVerification;
  /** Prix unitaire dans la devise demandée ; 0 si inconnu. */
  price: number;
  /** Variation 24 h en %, ou null. */
  change24h: number | null;
}

/** Adresse lue (conviviale ou brute) → brute en minuscules, ou null. */
export function rawJettonAddress(address: string): string | null {
  const a = parseTonAddress(address) ?? parseRawTonAddress(address.toLowerCase());
  return a ? toRawTonAddress(a).toLowerCase() : null;
}

/**
 * Image d'un jeton, en PNG. TonAPI sert du WebP signé (on ne peut pas changer
 * l'extension) ; React Native ne le décode pas sur iOS. Même proxy que les
 * icônes de réseau.
 */
export function jettonImageUrl(image: string | undefined): string | undefined {
  if (!image || !/^https:\/\//.test(image)) return undefined;
  if (!/\.webp(\?|$)/i.test(image)) return image;
  return `https://wsrv.nl/?url=${encodeURIComponent(image.replace(/^https:\/\//, ''))}&output=png&w=128&h=128&fit=cover`;
}

/** « +3.52% », « −0.03% » (signe moins UNICODE, relevé), « 0.00% » → nombre. */
function percent(s: unknown): number | null {
  if (typeof s !== 'string') return null;
  const n = Number(s.replace('−', '-').replace('%', '').replace('+', ''));
  return Number.isFinite(n) ? n : null;
}

/** Réponse `/v2/accounts/{a}/jettons?currencies=…` → soldes, listes noires écartées. */
export function parseJettonBalances(json: unknown, currency: string): TonJettonBalance[] {
  const list = (json as { balances?: unknown[] } | null)?.balances;
  if (!Array.isArray(list)) return [];
  const cur = currency.toUpperCase();
  const out: TonJettonBalance[] = [];
  for (const item of list as any[]) {
    const j = item?.jetton;
    const master = typeof j?.address === 'string' ? rawJettonAddress(j.address) : null;
    const wallet = typeof item?.wallet_address?.address === 'string' ? rawJettonAddress(item.wallet_address.address) : null;
    const decimals = Number(j?.decimals);
    if (!master || !wallet || !Number.isInteger(decimals) || decimals < 0 || decimals > 255) continue;
    if (!/^\d+$/.test(String(item.balance ?? ''))) continue;
    const verification: JettonVerification = j.verification === 'whitelist' ? 'whitelist' : j.verification === 'blacklist' ? 'blacklist' : 'none';
    if (verification === 'blacklist' || item?.wallet_address?.is_scam === true) continue;
    const raw = BigInt(item.balance);
    if (raw === 0n) continue;
    const price = Number(item.price?.prices?.[cur]);
    out.push({
      master,
      wallet,
      symbol: String(j.symbol ?? '').slice(0, 24) || '?',
      name: String(j.name ?? j.symbol ?? '').slice(0, 64),
      decimals,
      raw,
      image: jettonImageUrl(j.image),
      verification,
      price: Number.isFinite(price) && price > 0 ? price : 0,
      change24h: percent(item.price?.diff_24h?.[cur]),
    });
  }
  return out;
}

function tonAddress(address: string, testnet: boolean): Address {
  const friendly = parseTonAddress(address);
  if (friendly) {
    if (friendly.testnet && !testnet) throw new Error('Adresse TON du réseau de test : refusée sur le réseau principal');
    return new Address(friendly.workchain, Buffer.from(friendly.hash));
  }
  const raw = parseRawTonAddress(address.toLowerCase());
  if (raw) return new Address(raw.workchain, Buffer.from(raw.hash));
  throw new Error('Adresse TON invalide');
}

export interface JettonTransferParams {
  /** Montant en unités de base du jeton. */
  amount: bigint;
  /** Compte PROPRIÉTAIRE destinataire (pas son portefeuille de jeton). */
  to: string;
  /** Où rendre l'excédent de TON : l'expéditeur. */
  responseTo: string;
  comment?: string;
  queryId: bigint;
  testnet?: boolean;
  forwardTon?: bigint;
}

/** Corps `transfer` TEP-74, à envoyer au portefeuille de jeton de l'expéditeur. */
export function jettonTransferBody(p: JettonTransferParams): Cell {
  if (typeof p.amount !== 'bigint' || p.amount <= 0n) throw new Error('Montant de jeton invalide');
  if (p.queryId < 0n || p.queryId >= 1n << 64n) throw new Error('query_id hors limites');
  const testnet = !!p.testnet;
  return beginCell()
    .storeUint(JETTON_TRANSFER_OP, 32)
    .storeUint(p.queryId, 64)
    .storeCoins(p.amount)
    .storeAddress(tonAddress(p.to, testnet))
    .storeAddress(tonAddress(p.responseTo, testnet))
    .storeBit(0) // pas de custom_payload
    .storeCoins(p.forwardTon ?? JETTON_FORWARD_TON)
    // forward_payload : le commentaire en référence (comme Tonkeeper), sinon vide sur place.
    .storeMaybeRef(p.comment ? commentCell(p.comment) : null)
    .endCell();
}

/** Adresse brute → conviviale non rebondissante, pour l'affichage. */
export function showTonAddress(raw: string | undefined, testnet: boolean): string {
  const a = raw ? parseRawTonAddress(raw.toLowerCase()) : null;
  return a ? formatTonAddress(a, { bounceable: false, testnet }) : raw ?? '';
}
