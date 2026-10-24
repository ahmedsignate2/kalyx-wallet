/**
 * SIMULATION d'une transaction avant signature (§4.7, §5) : « Tu perds 50 USDC,
 * tu reçois 0,02 ETH ». Trois niveaux, du plus complet au plus sommaire :
 *  1. `alchemy_simulateAssetChanges` (réseaux avec RPC Alchemy) ;
 *  2. `eth_simulateV1` avec `traceTransfers` — le standard des nœuds (geth,
 *     Nethermind, Erigon, Reth…) : les journaux de transfert disent ce qui
 *     bouge, transferts natifs compris, sur des réseaux qu'Alchemy ne simule pas ;
 *  3. `eth_call` : ne dit pas ce qui bouge, mais si la transaction ÉCHOUERAIT.
 * Les deux premiers partent ensemble (le premier qui répond bien l'emporte,
 * Alchemy d'abord) ; chaque nœud qui ne connaît pas une méthode est retenu
 * pour la session. Repli STATIQUE : décodage du calldata — jamais
 * d'hexadécimal à l'écran.
 */
import { isAlchemyRpc, noteRelayResponse, relayPaused, relayServiceOf } from '../net/relay';
import type { ChainConfig } from '../chains/types';
import { withTimeout } from '../chains/net';
import { decodeTx } from './decodeTx';

export interface AssetChange {
  direction: 'out' | 'in';
  assetType: 'NATIVE' | 'ERC20' | 'ERC721' | 'ERC1155' | 'UNKNOWN';
  symbol: string;
  /** Montant brut (string décimal) ; NFT → tokenId. */
  rawAmount: string;
  decimals: number;
  contract?: string;
  tokenId?: string;
  logo?: string;
  counterparty?: string;
}

export interface Simulation {
  /**
   * 'alchemy' et 'node' : mouvements simulés ; 'call' : la transaction passerait
   * (vérifié), mais ce qui bouge n'a pas pu être lu ; 'static' : rien n'a tourné.
   */
  source: 'alchemy' | 'node' | 'call' | 'static';
  changes: AssetChange[];
  /** Approbations accordées par la tx (décodées, même en statique). */
  approvals: { spender: string; token: string; unlimited: boolean; all?: boolean }[];
  /** La simulation a tourné et dit que la transaction ÉCHOUERAIT (message du nœud, court). */
  error?: string;
}

/**
 * Nœuds qui ne savent pas simuler (« Unsupported method » : Alchemy sur
 * certains réseaux ou certaines offres). Retenus pour la session : on ne
 * redemande pas à chaque transaction, on passe directement à la lecture statique.
 */
const noSimulator = new Set<string>();

/** Pur : l'erreur JSON-RPC dit-elle « méthode inconnue ici » (et non « la transaction échouerait ») ? */
export function isUnsupportedMethod(err: { code?: number; message?: string } | undefined): boolean {
  if (!err) return false;
  return err.code === -32601 || /unsupported method|method not (found|supported|available)|does not exist|not available on/i.test(err.message ?? '');
}

/** Pur : parse la réponse Alchemy → changements du point de vue de `from`. */
export function parseAlchemySimulation(json: unknown, from: string): AssetChange[] {
  const j = json as { result?: { changes?: Record<string, unknown>[]; error?: { message?: string } }; error?: { message?: string } };
  const list = j?.result?.changes ?? [];
  const me = from.toLowerCase();
  const out: AssetChange[] = [];
  for (const c of list) {
    if (String(c.changeType) !== 'TRANSFER') continue;
    const f = String(c.from ?? '').toLowerCase();
    const t = String(c.to ?? '').toLowerCase();
    const direction: 'out' | 'in' | null = f === me ? 'out' : t === me ? 'in' : null;
    if (!direction) continue;
    const assetType = (['NATIVE', 'ERC20', 'ERC721', 'ERC1155'].includes(String(c.assetType)) ? c.assetType : 'UNKNOWN') as AssetChange['assetType'];
    out.push({
      direction,
      assetType,
      symbol: String(c.symbol ?? (assetType === 'NATIVE' ? 'ETH' : '?')),
      rawAmount: String(c.rawAmount ?? c.amount ?? '0'),
      decimals: typeof c.decimals === 'number' ? c.decimals : assetType === 'NATIVE' ? 18 : 0,
      contract: typeof c.contractAddress === 'string' ? c.contractAddress : undefined,
      tokenId: c.tokenId != null ? String(c.tokenId) : undefined,
      logo: typeof c.logo === 'string' ? c.logo : undefined,
      counterparty: direction === 'out' ? String(c.to ?? '') : String(c.from ?? ''),
    });
  }
  return out;
}

/** Pur : simulation STATIQUE depuis le calldata. */
export function staticSimulation(tx: { to?: string; value?: bigint | string; data?: string }, chain: ChainConfig, tokenMeta?: { symbol: string; decimals: number }): Simulation {
  const d = decodeTx(tx);
  const changes: AssetChange[] = [];
  const approvals: Simulation['approvals'] = [];
  const nativeValue = typeof tx.value === 'bigint' ? tx.value : tx.value ? BigInt(tx.value) : 0n;
  if (nativeValue > 0n) changes.push({ direction: 'out', assetType: 'NATIVE', symbol: chain.nativeSymbol, rawAmount: nativeValue.toString(), decimals: chain.nativeDecimals, counterparty: tx.to });
  if (d.kind === 'transfer') changes.push({ direction: 'out', assetType: 'ERC20', symbol: tokenMeta?.symbol ?? 'token', rawAmount: d.amount.toString(), decimals: tokenMeta?.decimals ?? 0, contract: d.token, counterparty: d.to });
  if (d.kind === 'approve') approvals.push({ spender: d.spender, token: d.token, unlimited: d.unlimited });
  if (d.kind === 'approveAll' && d.approved) approvals.push({ spender: d.operator, token: d.collection, unlimited: true, all: true });
  if (d.kind === 'nftTransfer') changes.push({ direction: 'out', assetType: 'ERC721', symbol: 'NFT', rawAmount: d.tokenId.toString(), decimals: 0, contract: d.collection, tokenId: d.tokenId.toString(), counterparty: d.to });
  return { source: 'static', changes, approvals };
}

/** Les mouvements viennent-ils d'une vraie simulation (et pas d'une lecture du calldata) ? */
export const simulatedChanges = (s: Simulation | null | undefined): boolean => !!s && !s.error && (s.source === 'alchemy' || s.source === 'node');

const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const TRANSFER_SINGLE = '0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62';
const TRANSFER_BATCH = '0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb';
/** Adresse fictive sous laquelle `traceTransfers` publie les mouvements de la pièce native. */
const NATIVE_PSEUDO = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

const topicAddr = (t: string | undefined) => (t && t.length >= 42 ? `0x${t.slice(-40)}`.toLowerCase() : '');
const word = (hex: string, i: number) => hex.slice(2 + i * 64, 2 + (i + 1) * 64);
const big = (w: string) => (w ? BigInt(`0x${w}`) : 0n);

/** Mouvement brut lu dans les journaux, avant les symboles. */
export interface RawMove {
  direction: 'out' | 'in';
  kind: 'NATIVE' | 'ERC20' | 'ERC721' | 'ERC1155';
  contract?: string;
  amount: bigint;
  tokenId?: string;
  counterparty: string;
}

/**
 * Pur : réponse `eth_simulateV1` → ÉCHEC (message du nœud) ou mouvements du
 * point de vue de `from`. `null` : réponse illisible (le nœud n'a pas simulé).
 */
export function parseSimulateV1(json: unknown, from: string): { reverted: string } | { moves: RawMove[] } | null {
  const call = (json as { result?: { calls?: unknown[] }[] })?.result?.[0]?.calls?.[0] as
    | { status?: string; error?: { message?: string }; logs?: { address?: string; topics?: string[]; data?: string }[] }
    | undefined;
  if (!call || typeof call.status !== 'string') return null;
  if (call.status !== '0x1') return { reverted: (call.error?.message ?? 'reverted').slice(0, 140) };
  const me = from.toLowerCase();
  const moves: RawMove[] = [];
  for (const log of call.logs ?? []) {
    const [t0, t1, t2, t3] = log.topics ?? [];
    const address = String(log.address ?? '').toLowerCase();
    const data = typeof log.data === 'string' ? log.data : '0x';
    let a = '';
    let b = '';
    let kind: RawMove['kind'] | null = null;
    let amount = 0n;
    let tokenId: string | undefined;
    if (t0 === TRANSFER && t1 && t2) {
      a = topicAddr(t1);
      b = topicAddr(t2);
      if (address === NATIVE_PSEUDO) (kind = 'NATIVE'), (amount = big(word(data, 0)));
      else if (t3) (kind = 'ERC721'), (amount = 1n), (tokenId = big(t3.slice(2)).toString());
      else (kind = 'ERC20'), (amount = big(word(data, 0)));
    } else if (t0 === TRANSFER_SINGLE && t2 && t3) {
      a = topicAddr(t2);
      b = topicAddr(t3);
      kind = 'ERC1155';
      tokenId = big(word(data, 0)).toString();
      amount = big(word(data, 1));
    } else if (t0 === TRANSFER_BATCH && t2 && t3) {
      a = topicAddr(t2);
      b = topicAddr(t3);
      kind = 'ERC1155';
      amount = 1n;
    }
    if (!kind || (a !== me && b !== me) || a === b) continue;
    moves.push({ direction: a === me ? 'out' : 'in', kind, contract: kind === 'NATIVE' ? undefined : address, amount, tokenId, counterparty: a === me ? b : a });
  }
  // Même actif, même sens : une seule ligne (une route qui passe par plusieurs pools ne fait pas trois « Tu perds »).
  const merged = new Map<string, RawMove>();
  for (const m of moves) {
    const key = `${m.direction}|${m.kind}|${m.contract ?? ''}|${m.kind === 'ERC20' || m.kind === 'NATIVE' ? '' : m.tokenId ?? ''}`;
    const prev = merged.get(key);
    if (prev) prev.amount += m.amount;
    else merged.set(key, { ...m });
  }
  return { moves: [...merged.values()] };
}

/** Pur : chaîne ABI (string) ou bytes32 → texte lisible, borné. */
export function decodeAbiString(hex: string): string | null {
  if (!/^0x[0-9a-f]*$/i.test(hex) || hex.length < 66) return null;
  let bytes: number[];
  if (hex.length === 66) {
    bytes = (hex.slice(2).match(/../g) ?? []).map((x) => parseInt(x, 16)).filter((x) => x !== 0);
  } else {
    const len = Number(big(word(hex, 1)));
    if (!Number.isSafeInteger(len) || len > 64) return null;
    bytes = (hex.slice(2 + 128, 2 + 128 + len * 2).match(/../g) ?? []).map((x) => parseInt(x, 16));
  }
  const text = new TextDecoder().decode(new Uint8Array(bytes)).replace(/[^\p{L}\p{N}.\-_$ ]/gu, '').trim();
  return text ? text.slice(0, 16) : null;
}

/** Nœuds qui ne connaissent pas `eth_simulateV1` (retenus pour la session). */
const noSimulateV1 = new Set<string>();
const ATTEMPT_MS = 4000;

async function rpc(url: string, body: unknown, ms = ATTEMPT_MS): Promise<{ result?: unknown; error?: { code?: number; message?: string } } | null> {
  const res = await withTimeout(fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), ms, () => new Error('timeout'));
  noteRelayResponse(url, res);
  if (!res.ok) return null;
  return (await res.json()) as { result?: unknown; error?: { code?: number; message?: string } };
}

const usable = (url: string) => {
  const svc = relayServiceOf(url);
  return !(svc && relayPaused(svc));
};
const hexValue = (v: bigint | string | undefined) => (typeof v === 'bigint' ? '0x' + v.toString(16) : v ? '0x' + BigInt(v).toString(16) : '0x0');

async function viaAlchemy(url: string, tx: { from: string; to?: string; value?: bigint | string; data?: string }, fallback: Simulation): Promise<Simulation | null> {
  const json = (await rpc(url, { jsonrpc: '2.0', id: 1, method: 'alchemy_simulateAssetChanges', params: [{ from: tx.from, to: tx.to, value: hexValue(tx.value), data: tx.data ?? '0x' }] })) as
    | { result?: { error?: { message?: string } }; error?: { code?: number; message?: string } }
    | null;
  if (!json) return null;
  if (json.error) {
    if (isUnsupportedMethod(json.error)) noSimulator.add(url);
    return null;
  }
  if (json.result?.error) return { ...fallback, error: (json.result.error.message ?? 'reverted').slice(0, 140) };
  return { source: 'alchemy', changes: parseAlchemySimulation(json, tx.from), approvals: fallback.approvals };
}

/** Symbole et décimales d'un contrat (deux `eth_call` en lot) ; null si illisibles. */
async function readMeta(url: string, token: string): Promise<{ symbol: string; decimals: number } | null> {
  const call = (id: number, data: string) => ({ jsonrpc: '2.0', id, method: 'eth_call', params: [{ to: token, data }, 'latest'] });
  const res = await withTimeout(fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify([call(1, '0x95d89b41'), call(2, '0x313ce567')]) }), 2500, () => new Error('timeout')).catch(() => null);
  if (!res?.ok) return null;
  const arr = (await res.json().catch(() => null)) as { id: number; result?: string }[] | null;
  if (!Array.isArray(arr)) return null;
  const sym = arr.find((x) => x.id === 1)?.result;
  const dec = arr.find((x) => x.id === 2)?.result;
  const symbol = typeof sym === 'string' ? decodeAbiString(sym) : null;
  const decimals = typeof dec === 'string' && /^0x[0-9a-f]+$/i.test(dec) ? Number(BigInt(dec)) : NaN;
  return symbol && Number.isInteger(decimals) && decimals >= 0 && decimals <= 36 ? { symbol, decimals } : null;
}

async function viaSimulateV1(
  url: string,
  chain: ChainConfig,
  tx: { from: string; to?: string; value?: bigint | string; data?: string },
  fallback: Simulation,
  tokenMeta?: { symbol: string; decimals: number },
): Promise<Simulation | null> {
  const call = { from: tx.from, to: tx.to, value: hexValue(tx.value), input: tx.data ?? '0x' };
  const json = await rpc(url, { jsonrpc: '2.0', id: 1, method: 'eth_simulateV1', params: [{ blockStateCalls: [{ calls: [call] }], traceTransfers: true, validation: false }, 'latest'] });
  if (!json) return null;
  if (json.error) {
    if (isUnsupportedMethod(json.error) || json.error.code === -32602) noSimulateV1.add(url);
    return null;
  }
  const parsed = parseSimulateV1(json, tx.from);
  if (!parsed) return null;
  if ('reverted' in parsed) return { ...fallback, error: parsed.reverted };
  const metas = new Map<string, { symbol: string; decimals: number } | null>();
  const known = decodeTx(tx);
  const tokens = [...new Set(parsed.moves.filter((m) => m.kind === 'ERC20').map((m) => m.contract!))];
  await Promise.all(
    tokens.map(async (c) => {
      if (tokenMeta && known.kind === 'transfer' && known.token.toLowerCase() === c) return void metas.set(c, tokenMeta);
      metas.set(c, await readMeta(url, c).catch(() => null));
    }),
  );
  const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
  const changes: AssetChange[] = parsed.moves.map((m) => {
    if (m.kind === 'NATIVE') return { direction: m.direction, assetType: 'NATIVE', symbol: chain.nativeSymbol, rawAmount: m.amount.toString(), decimals: chain.nativeDecimals, counterparty: m.counterparty };
    if (m.kind !== 'ERC20') return { direction: m.direction, assetType: m.kind, symbol: 'NFT', rawAmount: m.amount.toString(), decimals: 0, contract: m.contract, tokenId: m.tokenId, counterparty: m.counterparty };
    const meta = metas.get(m.contract!);
    // Jeton illisible : le montant reste inconnu (« ? ») plutôt qu'un nombre brut trompeur.
    return meta
      ? { direction: m.direction, assetType: 'ERC20', symbol: meta.symbol, rawAmount: m.amount.toString(), decimals: meta.decimals, contract: m.contract, counterparty: m.counterparty }
      : { direction: m.direction, assetType: 'UNKNOWN', symbol: short(m.contract!), rawAmount: '?', decimals: 0, contract: m.contract, counterparty: m.counterparty };
  });
  return { source: 'node', changes, approvals: fallback.approvals };
}

/** Dernier niveau : la transaction passerait-elle ? (rien sur les montants). */
async function viaCall(url: string, tx: { from: string; to?: string; value?: bigint | string; data?: string }, fallback: Simulation): Promise<Simulation | null> {
  const json = await rpc(url, { jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ from: tx.from, to: tx.to, value: hexValue(tx.value), data: tx.data ?? '0x' }, 'latest'] }, 3000);
  if (!json) return null;
  if (json.error) {
    // Seul un refus d'exécution est un verdict ; le reste (quota, méthode) ne dit rien de la transaction.
    const m = json.error.message ?? '';
    return json.error.code === 3 || /revert|execution|insufficient|exceeds|invalid opcode|out of gas/i.test(m) ? { ...fallback, error: m.slice(0, 140) } : null;
  }
  return { ...fallback, source: 'call' };
}

/** Simulation réseau à plusieurs niveaux, avec repli statique. Ne lève jamais. */
export async function simulateTx(
  chain: ChainConfig,
  tx: { from: string; to?: string; value?: bigint | string; data?: string },
  tokenMeta?: { symbol: string; decimals: number },
): Promise<Simulation> {
  const fallback = staticSimulation(tx, chain, tokenMeta);
  if (chain.family !== 'evm') return fallback;
  const urls = chain.rpcUrls.filter(usable);
  const alchemy = urls.find((u) => isAlchemyRpc(u) && !noSimulator.has(u));
  const v1 = urls.filter((u) => !noSimulateV1.has(u)).slice(0, 2);
  const safe = (p: Promise<Simulation | null>) => p.catch(() => null);
  // Ensemble ; la réponse retenue suit l'ordre de confiance (Alchemy, puis les nœuds dans l'ordre), verdict d'échec compris.
  const results = await Promise.all([alchemy ? safe(viaAlchemy(alchemy, tx, fallback)) : Promise.resolve(null), ...v1.map((u) => safe(viaSimulateV1(u, chain, tx, fallback, tokenMeta)))]);
  const best = results.find((r) => r);
  if (best) return best;
  for (const u of urls.slice(0, 2)) {
    const r = await safe(viaCall(u, tx, fallback));
    if (r) return r;
  }
  return fallback;
}

/** Tests : oublier ce que la session a appris des nœuds. */
export function resetSimulators(): void {
  noSimulator.clear();
  noSimulateV1.clear();
}
