/**
 * Historique EVM par `alchemy_getAssetTransfers`.
 *
 * Réécrit parce que l'ancienne lecture trahissait l'historique de quatre façons :
 *   - sans `order: "desc"`, Alchemy rend les transferts du PLUS ANCIEN au plus
 *     récent : un portefeuille actif ne montrait que son passé lointain ;
 *   - les NFT n'étaient pas demandés : un Basename reçu n'apparaissait pas ;
 *   - le dédoublonnage par hachage gardait UNE jambe d'un swap sur deux ;
 *   - l'adresse du token n'était pas gardée, si bien que le spam ne pouvait
 *     être jugé que sur son symbole — qu'un faussaire choisit librement.
 */
import type { TxParsed } from './types';
import { txFromLegs, type RawLeg } from '../tx/legs';

interface AlchemyTransfer {
  uniqueId?: string;
  hash?: string;
  blockNum?: string;
  from?: string;
  to?: string | null;
  asset?: string | null;
  category?: string;
  erc721TokenId?: string | null;
  tokenId?: string | null;
  erc1155Metadata?: { tokenId?: string; value?: string }[] | null;
  rawContract?: { value?: string | null; address?: string | null; decimal?: string | null };
  metadata?: { blockTimestamp?: string };
}

const big = (v: unknown): bigint => {
  try {
    return typeof v === 'string' && v ? BigInt(v) : 0n;
  } catch {
    return 0n;
  }
};

function transfersOf(json: unknown): AlchemyTransfer[] {
  const list = (json as { result?: { transfers?: unknown } } | null)?.result?.transfers;
  return Array.isArray(list) ? (list as AlchemyTransfer[]) : [];
}

/** Catégories demandées : `internal` n'existe que sur Ethereum et Polygon (400 ailleurs). */
export function alchemyCategories(chainId: string): string[] {
  const base = ['external', 'erc20', 'erc721', 'erc1155'];
  return chainId === 'ethereum' || chainId === 'polygon' ? [...base, 'internal'] : base;
}

/** Corps d'une requête : les plus RÉCENTS d'abord, 50 au plus. */
export function alchemyTransfersBody(owner: string, side: 'from' | 'to', chainId: string, id = 1): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    id,
    method: 'alchemy_getAssetTransfers',
    params: [
      {
        fromBlock: '0x0',
        toBlock: 'latest',
        [side === 'from' ? 'fromAddress' : 'toAddress']: owner,
        category: alchemyCategories(chainId),
        withMetadata: true,
        excludeZeroValue: false,
        order: 'desc',
        maxCount: '0x32',
      },
    ],
  });
}

/**
 * Réponses « reçus » et « envoyés » → une transaction par hachage, jambes
 * regroupées. `jsons` : les deux réponses brutes, dans n'importe quel ordre.
 */
export function parseAlchemyHistory(jsons: unknown[], ownerAddress: string): TxParsed[] {
  const owner = ownerAddress.toLowerCase();
  const seen = new Set<string>();
  const byHash = new Map<string, { ts: number; block: number; legs: (RawLeg & { external?: boolean })[] }>();
  for (const json of jsons) {
    for (const t of transfersOf(json)) {
      if (!t.hash) continue;
      const uid = t.uniqueId ?? `${t.hash}:${t.category}:${t.rawContract?.address ?? ''}:${t.from}:${t.to}:${t.rawContract?.value ?? ''}:${t.erc721TokenId ?? t.tokenId ?? ''}`;
      if (seen.has(uid)) continue;
      seen.add(uid);
      const from = (t.from ?? '').toLowerCase();
      const to = (t.to ?? '').toLowerCase();
      if (from !== owner && to !== owner) continue;
      const nft = t.category === 'erc721' || t.category === 'erc1155' || t.category === 'specialnft';
      const native = t.category === 'external' || t.category === 'internal';
      const e1155 = t.erc1155Metadata?.[0];
      const tokenId = nft ? (t.erc721TokenId ?? e1155?.tokenId ?? t.tokenId ?? undefined) : undefined;
      const leg: RawLeg & { external?: boolean } = {
        external: t.category === 'external',
        from: t.from ?? '',
        to: t.to ?? '',
        direction: from === owner ? 'out' : 'in',
        self: from === owner && to === owner,
        value: nft ? (e1155?.value ? big(e1155.value) : 1n) : big(t.rawContract?.value),
        ...(native ? {} : { asset: t.asset || '?', contract: t.rawContract?.address ?? undefined }),
        ...(!native && !nft && t.rawContract?.decimal ? { decimals: Number(big(t.rawContract.decimal)) } : {}),
        ...(nft ? { nft: true, decimals: 0, ...(tokenId ? { tokenId: big(tokenId).toString() } : {}) } : {}),
      };
      const raw = t.metadata?.blockTimestamp;
      const parsed = raw ? Math.floor(new Date(raw).getTime() / 1000) : NaN;
      const entry = byHash.get(t.hash) ?? { ts: Number.isFinite(parsed) ? parsed : 0, block: Number(big(t.blockNum)), legs: [] };
      entry.legs.push(leg);
      byHash.set(t.hash, entry);
    }
  }
  const out: TxParsed[] = [];
  for (const [hash, e] of byHash) {
    // `getAssetTransfers` ne rend que des transferts EXÉCUTÉS : réussis par construction.
    // Signée par le propriétaire = il est l'expéditeur de l'appel (transfert « external » sortant, même à 0).
    const byOwner = e.legs.some((l) => l.external && l.direction === 'out');
    const tx = txFromLegs({ hash, timestamp: e.ts, status: 'success', byOwner }, e.legs.map(({ external: _x, ...l }) => l));
    // Sans horodatage (Alchemy sur certains réseaux, dont Avalanche) : le bloc, pour retrouver la date.
    if (tx) out.push(e.ts ? tx : { ...tx, block: e.block });
  }
  const block = new Map([...byHash].map(([h, e]) => [h, e.block]));
  return out.sort((a, b) => b.timestamp - a.timestamp || (block.get(b.hash) ?? 0) - (block.get(a.hash) ?? 0));
}

/** Compatibilité : une seule réponse. */
export function parseAlchemyTransfers(json: unknown, ownerAddress: string): TxParsed[] {
  return parseAlchemyHistory([json], ownerAddress);
}
