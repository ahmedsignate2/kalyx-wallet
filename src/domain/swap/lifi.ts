/**
 * Swap & bridge via LI.FI (agrège DEX + bridges).
 *
 * On demande un devis (quote) qui contient la transaction à signer. LI.FI prend
 * ses frais par défaut ; on ajoute NOTRE fee intégrateur (0,3 %) reversé au
 * wallet configuré sur le portail LI.FI.
 *
 * La signature/exécution se fait via l'adapter EVM (lecture des clés isolée).
 */
import { withTimeout } from '../chains/net';

const API = 'https://li.quest/v1';
const KEY = (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_LIFI_KEY) || '';
const TIMEOUT = 20_000;

/** Frais intégrateur Nova. */
export const NOVA_INTEGRATOR = 'nova';
export const NOVA_FEE = '0.003'; // 0,3 %
export const DEFAULT_SLIPPAGE = '0.005'; // 0,5 %
/** Adresse « token natif » côté LI.FI. */
export const NATIVE_TOKEN = '0x0000000000000000000000000000000000000000';

export interface SwapTxRequest {
  to: string;
  data: string;
  value: bigint;
  chainId: number;
  gasLimit?: bigint;
  gasPrice?: bigint;
}

export interface SwapTokenInfo {
  address: string;
  symbol: string;
  decimals: number;
  logo?: string;
}

export interface SwapQuote {
  fromAmount: bigint;
  toAmount: bigint;
  toAmountMin: bigint;
  fromToken: SwapTokenInfo;
  toToken: SwapTokenInfo;
  /** Adresse à approuver (spender) si on part d'un ERC-20 ; null pour natif. */
  approvalAddress: string | null;
  toolName: string;
  /** Frais réseau (gas) estimés en USD. */
  gasCostUsd: number;
  /** Frais (LI.FI + intégrateur) en USD. */
  feeCostUsd: number;
  /** Durée d'exécution estimée (secondes). */
  durationSec: number;
  /** Valeurs USD d'entrée/sortie (pour l'impact prix). */
  fromAmountUsd: number;
  toAmountUsd: number;
  /** Slippage appliqué (fraction, ex. 0.005). */
  slippage: number;
  tx: SwapTxRequest;
}

function big(v: unknown): bigint {
  try {
    return BigInt(String(v ?? '0'));
  } catch {
    return 0n;
  }
}

function tokenOf(o: unknown): SwapTokenInfo {
  const c = (o ?? {}) as { address?: string; symbol?: string; decimals?: number; logoURI?: string };
  return {
    address: c.address ?? '',
    symbol: (c.symbol ?? '').toUpperCase(),
    decimals: typeof c.decimals === 'number' ? c.decimals : 18,
    logo: c.logoURI,
  };
}

/** Parse un devis LI.FI (pur, testé). Renvoie null si incomplet. */
export function parseSwapQuote(json: unknown): SwapQuote | null {
  const q = json as {
    estimate?: {
      fromAmount?: string;
      toAmount?: string;
      toAmountMin?: string;
      approvalAddress?: string;
      executionDuration?: number;
      fromAmountUSD?: string;
      toAmountUSD?: string;
      gasCosts?: { amountUSD?: string }[];
      feeCosts?: { amountUSD?: string }[];
    };
    action?: { fromToken?: unknown; toToken?: unknown; slippage?: number };
    transactionRequest?: { to?: string; data?: string; value?: string; chainId?: number; gasLimit?: string; gasPrice?: string };
    toolDetails?: { name?: string };
    tool?: string;
  };
  const tr = q?.transactionRequest;
  const est = q?.estimate;
  if (!tr?.to || !tr?.data || typeof tr.chainId !== 'number' || !est) return null;

  const approval = est.approvalAddress && est.approvalAddress !== '' ? est.approvalAddress : null;
  const sumUsd = (arr?: { amountUSD?: string }[]) =>
    (arr ?? []).reduce((s, c) => s + (Number(c.amountUSD) || 0), 0);
  return {
    fromAmount: big(est.fromAmount),
    toAmount: big(est.toAmount),
    toAmountMin: big(est.toAmountMin),
    fromToken: tokenOf(q.action?.fromToken),
    toToken: tokenOf(q.action?.toToken),
    approvalAddress: approval,
    toolName: q.toolDetails?.name ?? q.tool ?? 'LI.FI',
    gasCostUsd: sumUsd(est.gasCosts),
    feeCostUsd: sumUsd(est.feeCosts),
    durationSec: Number(est.executionDuration) || 0,
    fromAmountUsd: Number(est.fromAmountUSD) || 0,
    toAmountUsd: Number(est.toAmountUSD) || 0,
    slippage: typeof q.action?.slippage === 'number' ? q.action.slippage : Number(DEFAULT_SLIPPAGE),
    tx: {
      to: tr.to,
      data: tr.data,
      value: big(tr.value),
      chainId: tr.chainId,
      gasLimit: tr.gasLimit ? big(tr.gasLimit) : undefined,
      gasPrice: tr.gasPrice ? big(tr.gasPrice) : undefined,
    },
  };
}

export interface QuoteParams {
  fromChainId: number;
  toChainId: number;
  fromToken: string; // adresse (NATIVE_TOKEN pour le natif)
  toToken: string;
  fromAmount: bigint; // plus petite unité
  fromAddress: string;
}

async function fetchQuote(params: QuoteParams, withFee: boolean): Promise<SwapQuote | null> {
  const qs = new URLSearchParams({
    fromChain: String(params.fromChainId),
    toChain: String(params.toChainId),
    fromToken: params.fromToken,
    toToken: params.toToken,
    fromAmount: params.fromAmount.toString(),
    fromAddress: params.fromAddress,
    integrator: NOVA_INTEGRATOR,
    slippage: DEFAULT_SLIPPAGE,
  });
  if (withFee) qs.set('fee', NOVA_FEE);
  try {
    const res = await withTimeout(
      fetch(`${API}/quote?${qs.toString()}`, { headers: KEY ? { 'x-lifi-api-key': KEY } : {} }),
      TIMEOUT,
      () => new Error('timeout'),
    );
    if (!res.ok) return null;
    return parseSwapQuote(await res.json());
  } catch {
    return null;
  }
}

/**
 * Devis avec notre fee intégrateur ; si LI.FI le refuse (config portail
 * incomplète), on réessaie sans fee pour que le swap fonctionne quand même.
 */
export async function getSwapQuote(params: QuoteParams): Promise<SwapQuote | null> {
  return (await fetchQuote(params, true)) ?? fetchQuote(params, false);
}
