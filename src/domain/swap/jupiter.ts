/**
 * Jupiter (Solana) — 2ᵉ source de devis intra-Solana, en concurrence avec LI.FI.
 *
 * Endpoint public `lite-api.jup.ag/swap/v1` (l'ancien `quote-api.jup.ag/v6` est
 * mort depuis 2025). Sans clé : ~60 req/min, suffisant pour un wallet.
 * La tx renvoyée est une VersionedTransaction base64 (ALT incluses), avec
 * compute-unit dynamique et frais de priorité plafonnés (0,002 SOL) pour passer
 * même en période de congestion.
 */
import { withTimeout } from '../chains/net';
import { SwapError } from './swapError';
import { type SwapQuote, type QuoteParams, NATIVE_TOKEN } from './lifi';

const JUPITER_API = 'https://lite-api.jup.ag/swap/v1';
const TIMEOUT = 15_000;
const WSOL = 'So11111111111111111111111111111111111111112';
const SOL_NATIVE = '11111111111111111111111111111111';

function toMint(addr: string): string {
  return addr === NATIVE_TOKEN || addr === SOL_NATIVE ? WSOL : addr;
}

/** Traduit une erreur Jupiter (pur). */
export function parseJupiterError(status: number, json: unknown): SwapError {
  const j = (json ?? {}) as { error?: string; errorCode?: string };
  const msg = String(j.error ?? '');
  const code = String(j.errorCode ?? '');
  if (status === 429) return new SwapError('RATE_LIMITED', msg || 'Too many requests');
  if (status >= 500) return new SwapError('PROVIDER_UNAVAILABLE', msg || `Jupiter ${status}`);
  if (code === 'NO_ROUTES_FOUND' || /no routes?/i.test(msg)) return new SwapError('NO_ROUTE', msg);
  if (/cannot be parsed|invalid/i.test(msg)) return new SwapError('INVALID_TOKEN', msg);
  if (/amount/i.test(msg)) return new SwapError('AMOUNT_BELOW_MINIMUM', msg);
  return new SwapError('NO_ROUTE', msg || `Jupiter ${status}`);
}

export async function getJupiterQuote(params: QuoteParams): Promise<SwapQuote | null> {
  const slippageBps = Math.round((params.slippage && params.slippage > 0 ? params.slippage : 0.005) * 10_000);
  const url = new URL(`${JUPITER_API}/quote`);
  url.searchParams.set('inputMint', toMint(params.fromToken));
  url.searchParams.set('outputMint', toMint(params.toToken));
  url.searchParams.set('amount', params.fromAmount.toString());
  url.searchParams.set('slippageBps', String(slippageBps));

  try {
    const res = await withTimeout(fetch(url.toString()), TIMEOUT, () => new Error('timeout'));
    if (!res.ok) throw parseJupiterError(res.status, await res.json().catch(() => ({})));
    const data = await res.json();
    if (!data?.outAmount) throw new SwapError('NO_ROUTE', 'Jupiter: devis vide');

    const swapRes = await withTimeout(
      fetch(`${JUPITER_API}/swap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteResponse: data,
          userPublicKey: params.fromAddress,
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: 2_000_000, priorityLevel: 'high' } },
        }),
      }),
      TIMEOUT,
      () => new Error('timeout'),
    );
    if (!swapRes.ok) throw parseJupiterError(swapRes.status, await swapRes.json().catch(() => ({})));
    const swapData = await swapRes.json();
    if (!swapData?.swapTransaction) throw new SwapError('PROVIDER_UNAVAILABLE', 'Jupiter: transaction absente');
    if (swapData.simulationError?.error) {
      throw new SwapError('NO_ROUTE', `Jupiter: ${swapData.simulationError.error}`);
    }

    const prioLamports = BigInt(swapData.prioritizationFeeLamports ?? 0);
    return {
      fromAmount: params.fromAmount,
      toAmount: BigInt(data.outAmount),
      toAmountMin: BigInt(data.otherAmountThreshold || data.outAmount),
      // Décimales/symbole complétés par le routeur (Jupiter ne les renvoie pas).
      fromToken: { address: params.fromToken, symbol: '', decimals: -1 },
      toToken: { address: params.toToken, symbol: '', decimals: -1 },
      approvalAddress: null,
      toolName: 'Jupiter',
      gasCostUsd: 0,
      gasCostNative: 5_000n + prioLamports, // frais de base + priorité
      gasToken: { address: SOL_NATIVE, symbol: 'SOL', decimals: 9 },
      feeCostUsd: 0,
      durationSec: 5,
      fromAmountUsd: 0,
      toAmountUsd: 0,
      slippage: slippageBps / 10_000,
      tx: { type: 'solana', data: swapData.swapTransaction },
    };
  } catch (e) {
    if (e instanceof SwapError) throw e;
    throw new SwapError('NETWORK', e instanceof Error ? e.message : 'network');
  }
}
