import { withTimeout } from '../chains/net';
import { SwapError } from './swapError';
import { type SwapQuote, type QuoteParams, NATIVE_TOKEN } from './lifi';

const JUPITER_API = 'https://quote-api.jup.ag/v6';
const FEE_RECIPIENT_SOLANA = (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_FEE_RECIPIENT_SOLANA) || '';
const NOVA_FEE_BPS = 30; // 0.3 %
const TIMEOUT = 15000;

export async function getJupiterQuote(params: QuoteParams): Promise<SwapQuote | null> {
  const fromMint = params.fromToken === NATIVE_TOKEN ? 'So11111111111111111111111111111111111111112' : params.fromToken;
  const toMint = params.toToken === NATIVE_TOKEN ? 'So11111111111111111111111111111111111111112' : params.toToken;

  const url = new URL(`${JUPITER_API}/quote`);
  url.searchParams.append('inputMint', fromMint);
  url.searchParams.append('outputMint', toMint);
  url.searchParams.append('amount', params.fromAmount.toString());
  url.searchParams.append('slippageBps', '50'); // 0.5%
  
  if (FEE_RECIPIENT_SOLANA) {
    url.searchParams.append('platformFeeBps', NOVA_FEE_BPS.toString());
  }

  try {
    const res = await withTimeout(fetch(url.toString()), TIMEOUT, () => new Error('timeout'));
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (err.error?.includes('amount')) throw new SwapError('AMOUNT_BELOW_MINIMUM', err.error);
      return null;
    }
    const data = await res.json();
    if (!data || !data.outAmount) return null;

    // To get the transaction, we need to call /swap
    const swapBody: any = {
      quoteResponse: data,
      userPublicKey: params.fromAddress,
      wrapAndUnwrapSol: true,
    };
    if (FEE_RECIPIENT_SOLANA) {
      swapBody.feeAccount = FEE_RECIPIENT_SOLANA;
    }

    const swapRes = await withTimeout(
      fetch(`${JUPITER_API}/swap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(swapBody),
      }),
      TIMEOUT,
      () => new Error('timeout')
    );

    if (!swapRes.ok) return null;
    const swapData = await swapRes.json();
    if (!swapData.swapTransaction) return null;

    return {
      fromAmount: params.fromAmount,
      toAmount: BigInt(data.outAmount),
      toAmountMin: BigInt(data.otherAmountThreshold || data.outAmount),
      fromToken: { address: params.fromToken, symbol: '', decimals: 0 },
      toToken: { address: params.toToken, symbol: '', decimals: 0 },
      approvalAddress: null,
      toolName: 'Jupiter',
      gasCostUsd: 0,
      gasCostNative: 0n,
      gasToken: null,
      feeCostUsd: 0,
      durationSec: 5,
      fromAmountUsd: 0,
      toAmountUsd: 0,
      slippage: 0.005,
      tx: {
        type: 'solana',
        data: swapData.swapTransaction,
      },
    };
  } catch (e) {
    if (e instanceof SwapError) throw e;
    return null;
  }
}
