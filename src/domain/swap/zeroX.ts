import { withTimeout } from '../chains/net';
import { SwapError } from './swapError';
import type { SwapQuote, QuoteParams } from './lifi';

const API = 'https://api.0x.org/swap/permit2/quote';
// fallback to v1 if needed, but 0x API requires the chain prefix usually, e.g. https://ethereum.api.0x.org/swap/v1/quote
// Let's implement a simplified 0x stub that just returns null for now, 
// or maybe we should actually query 0x v1 API?
// A stub is safer to avoid breaking, but the user expects 0x.
// Let's implement the standard 0x v1 swap endpoint:

const CHAIN_TO_0X: Record<string, string> = {
  '1': 'ethereum',
  '10': 'optimism',
  '56': 'bsc',
  '137': 'polygon',
  '8453': 'base',
  '42161': 'arbitrum',
  '43114': 'avalanche'
};

export async function getZeroXQuote(params: QuoteParams): Promise<SwapQuote | null> {
  const chainName = CHAIN_TO_0X[String(params.fromChainId)];
  if (!chainName || String(params.fromChainId) !== String(params.toChainId)) return null; // 0x v1 is same-chain only
  
  const qs = new URLSearchParams({
    sellToken: params.fromToken,
    buyToken: params.toToken,
    sellAmount: params.fromAmount.toString(),
    takerAddress: params.fromAddress,
  });

  const headers: Record<string, string> = {
    '0x-api-key': (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_ZEROX_KEY) || '',
  };
  
  if (!headers['0x-api-key']) return null; // Can't query 0x without API key reliably anymore

  try {
    const res = await withTimeout(
      fetch(`https://${chainName}.api.0x.org/swap/v1/quote?${qs.toString()}`, { headers }),
      10000,
      () => new Error('timeout')
    );
    
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (err.validationErrors?.some((v: any) => v.reason === 'INSUFFICIENT_ASSET_LIQUIDITY')) return null;
      return null;
    }
    
    const data = await res.json();
    return {
      fromAmount: BigInt(data.sellAmount),
      toAmount: BigInt(data.buyAmount),
      toAmountMin: BigInt(data.guaranteedPrice ? Math.floor(Number(data.sellAmount) * Number(data.guaranteedPrice)) : data.buyAmount),
      fromToken: { address: params.fromToken, symbol: '', decimals: 18 },
      toToken: { address: params.toToken, symbol: '', decimals: 18 },
      approvalAddress: data.allowanceTarget,
      toolName: '0x',
      gasCostUsd: 0,
      gasCostNative: BigInt(data.estimatedGas || 0) * BigInt(data.gasPrice || 0),
      gasToken: null,
      feeCostUsd: 0,
      durationSec: 15,
      fromAmountUsd: 0,
      toAmountUsd: 0,
      slippage: 0.01,
      tx: {
        type: 'evm',
        to: data.to,
        data: data.data,
        value: BigInt(data.value || 0),
        chainId: Number(params.fromChainId),
      },
    };
  } catch {
    return null;
  }
}
