/**
 * SIMULATION d'une transaction avant signature (§4.7, §5) : « Tu perds 50 USDC,
 * tu reçois 0,02 ETH ». Source : `alchemy_simulateAssetChanges` (réseaux avec
 * RPC Alchemy). Repli STATIQUE : décodage du calldata (transfert natif / ERC-20)
 * — moins complet mais jamais d'hexadécimal à l'écran.
 */
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
  source: 'alchemy' | 'static';
  changes: AssetChange[];
  /** Approbations accordées par la tx (décodées, même en statique). */
  approvals: { spender: string; token: string; unlimited: boolean; all?: boolean }[];
  error?: string;
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

/** Simulation réseau (Alchemy) avec repli statique. Ne lève jamais. */
export async function simulateTx(
  chain: ChainConfig,
  tx: { from: string; to?: string; value?: bigint | string; data?: string },
  tokenMeta?: { symbol: string; decimals: number },
): Promise<Simulation> {
  const fallback = staticSimulation(tx, chain, tokenMeta);
  const url = chain.rpcUrls.find((u) => u.includes('.alchemy.com'));
  if (!url) return fallback;
  try {
    const value = typeof tx.value === 'bigint' ? '0x' + tx.value.toString(16) : tx.value ? '0x' + BigInt(tx.value).toString(16) : '0x0';
    const res = await withTimeout(
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'alchemy_simulateAssetChanges', params: [{ from: tx.from, to: tx.to, value, data: tx.data ?? '0x' }] }) }),
      10_000,
      () => new Error('timeout'),
    );
    const json = (await res.json()) as { result?: { error?: { message?: string } }; error?: { message?: string } };
    if (json.error) return { ...fallback, error: json.error.message };
    if (json.result?.error) return { ...fallback, error: json.result.error.message ?? 'La simulation a échoué' };
    const changes = parseAlchemySimulation(json, tx.from);
    return { source: 'alchemy', changes, approvals: fallback.approvals };
  } catch {
    return fallback;
  }
}
