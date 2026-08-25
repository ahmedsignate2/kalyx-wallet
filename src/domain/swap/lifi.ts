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
import { SwapError } from './swapError';

const API = 'https://li.quest/v1';
const KEY = (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_LIFI_KEY) || '';
const TIMEOUT = 20_000;

/** Frais intégrateur Nova. */
export const NOVA_INTEGRATOR = 'nova';
export const NOVA_FEE = '0.003'; // 0,3 %
export const DEFAULT_SLIPPAGE = '0.005'; // 0,5 %
/** Adresse « token natif » côté LI.FI. */
export const NATIVE_TOKEN = '0x0000000000000000000000000000000000000000';

export interface EvmSwapTx {
  type: 'evm';
  to: string;
  data: string;
  value: bigint;
  chainId: number | string;
  gasLimit?: bigint;
  gasPrice?: bigint;
}

export interface SolanaSwapTx {
  type: 'solana';
  data: string; // base64 encoded transaction
}

export interface BitcoinSwapTx {
  type: 'bitcoin';
  data: string; // base64 encoded PSBT
}

export type SwapTxRequest = EvmSwapTx | SolanaSwapTx | BitcoinSwapTx;

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
  /** Frais réseau en token natif (plus petite unité) + infos du token. */
  gasCostNative: bigint;
  gasToken: SwapTokenInfo | null;
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
      gasCosts?: { amountUSD?: string; amount?: string; token?: unknown }[];
      feeCosts?: { amountUSD?: string }[];
    };
    action?: { fromChainId?: number; fromToken?: unknown; toToken?: unknown; slippage?: number };
    transactionRequest?: { to?: string; data?: string; value?: string; chainId?: number; gasLimit?: string; gasPrice?: string };
    toolDetails?: { name?: string };
    tool?: string;
  };
  const tr = q?.transactionRequest;
  const est = q?.estimate;
  if (!tr?.data || !est) return null;

  const isSolana = q.action?.fromChainId === 1151111081099710;
  if (!isSolana && (!tr.to || typeof tr.chainId !== 'number')) return null;

  let txReq: SwapTxRequest;
  if (isSolana) {
    txReq = { type: 'solana', data: tr.data };
  } else {
    txReq = {
      type: 'evm',
      to: tr.to!,
      data: tr.data,
      value: big(tr.value),
      chainId: tr.chainId!,
      gasLimit: tr.gasLimit ? big(tr.gasLimit) : undefined,
      gasPrice: tr.gasPrice ? big(tr.gasPrice) : undefined,
    };
  }

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
    gasCostNative: (est.gasCosts ?? []).reduce((s, c) => s + big(c.amount), 0n),
    gasToken: est.gasCosts?.[0]?.token ? tokenOf(est.gasCosts[0].token) : null,
    feeCostUsd: sumUsd(est.feeCosts),
    durationSec: Number(est.executionDuration) || 0,
    fromAmountUsd: Number(est.fromAmountUSD) || 0,
    toAmountUsd: Number(est.toAmountUSD) || 0,
    slippage: typeof q.action?.slippage === 'number' ? q.action.slippage : Number(DEFAULT_SLIPPAGE),
    tx: txReq,
  };
}

export interface QuoteParams {
  fromChainId: number | string;
  toChainId: number | string;
  fromToken: string; // adresse (NATIVE_TOKEN pour le natif)
  toToken: string;
  fromAmount: bigint; // plus petite unité
  fromAddress: string; toAddress?: string;
}

async function fetchQuote(params: QuoteParams, withFee: boolean): Promise<SwapQuote | null> {
  const FEE_RECIPIENT = (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_FEE_RECIPIENT_EVM) || '';
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
  if (params.toAddress) {
    qs.set('toAddress', params.toAddress);
  }
  if (withFee) {
    qs.set('fee', NOVA_FEE);
    if (FEE_RECIPIENT) qs.set('feeRecipient', FEE_RECIPIENT);
  }

  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'User-Agent': 'NovaWallet/0.0.1',
  };
  if (KEY) headers['x-lifi-api-key'] = KEY;

  let retries = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const res = await withTimeout(
        fetch(`${API}/quote?${qs.toString()}`, { headers }),
        TIMEOUT,
        () => new Error('timeout'),
      );
      if (!res.ok) {
        // Retry on transient server errors (5xx, 429 rate-limit).
        if ((res.status >= 500 || res.status === 429) && retries > 0) {
          retries--;
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        // Parse LI.FI error body for precise diagnostics.
        const errJson = await res.json().catch(() => ({} as Record<string, unknown>));
        const msg = (String(errJson.message ?? '')).toLowerCase();

        if (msg.includes('amount is too low') || msg.includes('minimum')) {
          const min = errJson.minAmount;
          throw new SwapError(
            'AMOUNT_BELOW_MINIMUM',
            String(errJson.message ?? 'Amount too low'),
            min ? { min: String(min) } : undefined,
          );
        }
        if (msg.includes('no routes') || msg.includes('no available')) return null;
        if (msg.includes('slippage')) {
          throw new SwapError('SLIPPAGE_TOO_HIGH', String(errJson.message ?? 'Slippage too high'));
        }
        return null;
      }
      return parseSwapQuote(await res.json());
    } catch (e) {
      // Re-throw typed swap errors for the UI.
      if (e instanceof SwapError) throw e;
      // Retry once on timeout.
      if (retries > 0 && e instanceof Error && e.message === 'timeout') {
        retries--;
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      return null;
    }
  }
}

/**
 * Devis intelligent multi-fournisseur :
 * - Cross-chain (bridge) : Relay d'abord, LI.FI en fallback.
 * - Same-chain (swap) : LI.FI directement (agrège les DEX).
 * - Fee intégrateur : 0.3 % sur tous les moteurs. Si LI.FI le refuse
 *   (config portail incomplète), retry sans fee.
 */
// getSwapQuote a été déplacé vers index.ts (Nova Smart Router)
export async function getSwapQuote(params: QuoteParams): Promise<SwapQuote | null> {
  return (await fetchQuote(params, true)) ?? fetchQuote(params, false);
}
