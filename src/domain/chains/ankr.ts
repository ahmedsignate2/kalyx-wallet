/**
 * Historique EVM par l'API avancée d'Ankr (repli d'Alchemy, et source des
 * réseaux qu'Alchemy ne couvre pas).
 *
 * Deux défauts de l'ancienne lecture, relevés sur un vrai portefeuille
 * (`ankr-base-live.json`) :
 *   - l'horodatage arrive en HEXADÉCIMAL (« 0x6ab7d8df ») ; `new Date` en
 *     faisait NaN, remplacé par « maintenant » — toutes les lignes datées du
 *     jour, dans le désordre ;
 *   - seules les transactions natives étaient lues : un envoi d'USDC y devenait
 *     « interaction avec 0x8335… », et les airdrops passaient inaperçus du filtre.
 * Les transferts de tokens (`ankr_getTokenTransfers`) sont maintenant fusionnés
 * par hachage avec les transactions, comme pour Alchemy.
 */
import type { TxParsed } from './types';
import { txFromLegs, type RawLeg } from '../tx/legs';

const ANKR_URL = 'https://rpc.ankr.com/multichain/a8acb82bb28e6bf5c1e4a1ea695c9cc09ecbb9161bbdf5cb7b055a447692cdac';

const big = (v: unknown): bigint => {
  try {
    return v === undefined || v === null || v === '' ? 0n : BigInt(String(v));
  } catch {
    return 0n;
  }
};

/** Horodatage Ankr : hexadécimal, décimal, secondes ou millisecondes. */
export function ankrTime(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw ? Number(raw.startsWith('0x') ? BigInt(raw) : raw) : NaN;
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n > 1e11 ? Math.floor(n / 1000) : Math.floor(n);
}

interface AnkrTx { hash?: string; transactionHash?: string; from?: string; to?: string | null; value?: string; status?: string | number | boolean; timestamp?: string | number; blockNumber?: string }
interface AnkrTransfer { transactionHash?: string; fromAddress?: string; toAddress?: string; contractAddress?: string; valueRawInteger?: string; tokenSymbol?: string; tokenDecimals?: number; timestamp?: number; blockHeight?: number }

export function parseAnkrHistory(txJson: unknown, transfersJson: unknown, ownerAddress: string): TxParsed[] {
  const owner = ownerAddress.toLowerCase();
  const txs = ((txJson as { result?: { transactions?: AnkrTx[] } } | null)?.result?.transactions ?? []) as AnkrTx[];
  const transfers = ((transfersJson as { result?: { transfers?: AnkrTransfer[] } } | null)?.result?.transfers ?? []) as AnkrTransfer[];
  const byHash = new Map<string, { ts: number; status: TxParsed['status']; byOwner?: boolean; legs: RawLeg[] }>();
  const entry = (hash: string, ts: number) => {
    const key = hash.toLowerCase();
    const e = byHash.get(key) ?? { ts, status: 'success' as TxParsed['status'], legs: [] };
    if (!e.ts) e.ts = ts;
    byHash.set(key, e);
    return e;
  };
  for (const t of txs) {
    const hash = t.hash ?? t.transactionHash;
    if (!hash) continue;
    const from = (t.from ?? '').toLowerCase();
    const to = (t.to ?? '').toLowerCase();
    if (from !== owner && to !== owner) continue;
    const e = entry(hash, ankrTime(t.timestamp));
    e.status = t.status === '0x1' || t.status === '1' || t.status === 1 || t.status === 'SUCCESS' || t.status === true ? 'success' : 'failed';
    e.byOwner = from === owner;
    e.legs.push({ from: t.from ?? '', to: t.to ?? '', direction: from === owner ? 'out' : 'in', self: from === owner && to === owner, value: big(t.value) });
  }
  for (const t of transfers) {
    if (!t.transactionHash) continue;
    const from = (t.fromAddress ?? '').toLowerCase();
    const to = (t.toAddress ?? '').toLowerCase();
    if (from !== owner && to !== owner) continue;
    const e = entry(t.transactionHash, ankrTime(t.timestamp));
    e.legs.push({
      from: t.fromAddress ?? '',
      to: t.toAddress ?? '',
      direction: from === owner ? 'out' : 'in',
      self: from === owner && to === owner,
      value: big(t.valueRawInteger),
      asset: t.tokenSymbol || '?',
      ...(Number.isInteger(t.tokenDecimals) ? { decimals: t.tokenDecimals } : {}),
      ...(t.contractAddress ? { contract: t.contractAddress } : {}),
    });
  }
  /*
   * Un transfert de token sans transaction à nous dans la page n'a pas été
   * signé par nous — à condition que la page COUVRE sa date. Plus ancien que la
   * plus vieille transaction lue, on ne sait pas : on ne conclut rien.
   */
  const nativeTimes = txs.map((t) => ankrTime(t.timestamp)).filter((x) => x > 0);
  const covered = nativeTimes.length ? Math.min(...nativeTimes) : Infinity;
  const out: TxParsed[] = [];
  for (const [hash, e] of byHash) {
    const byOwner = e.byOwner ?? (e.ts >= covered ? false : undefined);
    const tx = txFromLegs({ hash, timestamp: e.ts, status: e.status, byOwner }, e.legs);
    if (tx) out.push(tx);
  }
  return out.sort((a, b) => b.timestamp - a.timestamp);
}

async function ankr(method: string, params: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(ANKR_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const json = (await res.json()) as { result?: unknown; error?: { message?: string } };
  if (!json?.result) throw new Error(`Ankr ${method}: ${json?.error?.message ?? res.status}`);
  return json;
}

export async function fetchAnkrHistory(address: string, blockchain: string): Promise<TxParsed[]> {
  try {
    const [txs, transfers] = await Promise.all([
      ankr('ankr_getTransactionsByAddress', { address, blockchain, descOrder: true, pageSize: 40, includeLogs: false }),
      // Un réseau sans index de tokens chez Ankr ne doit pas priver des transactions natives.
      ankr('ankr_getTokenTransfers', { address, blockchain, descOrder: true, pageSize: 40 }).catch(() => null),
    ]);
    return parseAnkrHistory(txs, transfers, address);
  } catch (e) {
    console.warn(`Ankr fallback failed for ${blockchain}:`, e);
    return [];
  }
}
