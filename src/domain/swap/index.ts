import { getSwapQuote as getLifiQuote } from './lifi';
import { getJupiterQuote } from './jupiter';
import { getRelayQuote } from './relay';
import { getZeroXQuote } from './zeroX';
import { getAdapter } from '../chains/registry';
import { SwapError } from './swapError';
import type { SwapQuote } from './lifi';

export interface RouteParams {
  fromChainId: string;
  toChainId: string;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  fromAddress: string;
  slippage?: number;
  toAddress: string;
}

export async function getBestQuote(params: RouteParams): Promise<SwapQuote | null> {
  const fromChain = getAdapter(params.fromChainId).config;
  const toChain = getAdapter(params.toChainId).config;

  const isEvmTarget = toChain.family === 'evm';
  const isSolanaTarget = toChain.family === 'solana';
  const isEvmAddress = params.toAddress.startsWith('0x') && params.toAddress.length === 42;
  const isSolanaAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(params.toAddress);

  if (isEvmTarget && !isEvmAddress) throw new SwapError('NO_ROUTE', 'Invalid destination address for EVM chain');
  if (isSolanaTarget && !isSolanaAddress) throw new SwapError('NO_ROUTE', 'Invalid destination address for Solana chain');

  const promises: Promise<SwapQuote | null>[] = [];
  const errors: SwapError[] = [];

  // Wrap query to catch specific SwapErrors
  const query = async (name: string, fn: () => Promise<SwapQuote | null>) => {
    try { return await fn(); }
    catch (e) {
      if (e instanceof SwapError) errors.push(e);
      return null;
    }
  };

  // 1. Intra-EVM
  if (fromChain.family === 'evm' && toChain.family === 'evm') {
    const lifiArgs = {
      fromChainId: Number(fromChain.evmChainId || fromChain.id),
      toChainId: Number(toChain.evmChainId || toChain.id),
      fromToken: params.fromToken,
      toToken: params.toToken,
      fromAmount: BigInt(params.fromAmount),
      fromAddress: params.fromAddress,
    };
    promises.push(query('LIFI', () => getLifiQuote(lifiArgs)));
    promises.push(query('0x', () => getZeroXQuote(lifiArgs)));
    
    // Relay supports EVM-EVM as well
    promises.push(query('Relay', () => getRelayQuote({
      fromChainId: fromChain.relayId || fromChain.id,
      toChainId: toChain.relayId || toChain.id,
      fromToken: params.fromToken,
      toToken: params.toToken,
      fromAmount: params.fromAmount,
      toAddress: params.toAddress,
    })));
  }
  // 2. Intra-Solana
  else if (fromChain.family === 'solana' && toChain.family === 'solana') {
    promises.push(query('Jupiter', () => getJupiterQuote({
      fromToken: params.fromToken,
      toToken: params.toToken,
      fromAmount: BigInt(params.fromAmount),
      fromAddress: params.fromAddress,
      fromChainId: params.fromChainId,
      toChainId: params.toChainId,
    })));
  }
  // 3. Cross-VM
  else {
    promises.push(query('Relay', () => getRelayQuote({
      fromChainId: fromChain.relayId || fromChain.id,
      toChainId: toChain.relayId || toChain.id,
      fromToken: params.fromToken,
      toToken: params.toToken,
      fromAmount: params.fromAmount,
      toAddress: params.toAddress,
    })));
  }

  const results = await Promise.all(promises);
  const validQuotes = results.filter((q): q is SwapQuote => q !== null);

  if (validQuotes.length > 0) {
    // Nova choose best route: sort by output amount (descending)
    validQuotes.sort((a, b) => (b.toAmountMin > a.toAmountMin ? 1 : -1));
    return validQuotes[0];
  }

  // If no routes found, propagate the most relevant SwapError instead of a generic NO_ROUTE
  if (errors.length > 0) {
    // Prioritize specific errors over generic ones
    const criticalError = errors.find(e => e.code !== 'NO_ROUTE');
    throw criticalError || errors[0];
  }

  throw new SwapError('NO_ROUTE', 'Aucune route trouvée.');
}

export * from './swapError';
export * from './lifi';
export * from './relay';
export * from './jupiter';
export * from './zeroX';
