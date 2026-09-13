import { parseLifiError } from './lifi';
import { parseJupiterError } from './jupiter';
import { parseRelayError, approveSpender } from './relay';
import { SwapError, pickMostRelevant } from './swapError';
import { pickBest, normalizeQuote, isEvmAddress, isSolanaAddress, getBestQuote } from './index';
import type { SwapQuote } from './lifi';

describe('parseLifiError', () => {
  it('extrait le minimum depuis les sous-routes (réponse réelle 404/1002)', () => {
    const e = parseLifiError(404, {
      message: 'No available quotes for the requested transfer',
      code: 1002,
      errors: {
        filteredOut: [{ reason: 'Transferred amount (11380) out of acceptable range (min: 1000000000000, max: Infinity)' }],
        failed: [{ subpaths: { a: [{ errorType: 'NO_QUOTE', message: 'amount too small (min ~0.0004081 eth)' }] } }],
      },
    });
    expect(e.code).toBe('AMOUNT_BELOW_MINIMUM');
    expect(e.meta).toEqual({ min: '0.0004081', symbol: 'ETH' });
  });
  it('classe deny-list, rate-limit, 5xx, slippage', () => {
    expect(parseLifiError(400, { message: 'Token 1-0x11 is invalid or in deny list.', code: 1011 }).code).toBe('INVALID_TOKEN');
    expect(parseLifiError(429, {}).code).toBe('RATE_LIMITED');
    expect(parseLifiError(502, {}).code).toBe('PROVIDER_UNAVAILABLE');
    expect(parseLifiError(400, { message: 'Slippage too high' }).code).toBe('SLIPPAGE_TOO_HIGH');
    expect(parseLifiError(404, { message: 'No available quotes' }).code).toBe('NO_ROUTE');
  });
});

describe('parseJupiterError / parseRelayError', () => {
  it('Jupiter', () => {
    expect(parseJupiterError(400, { error: 'No routes found', errorCode: 'NO_ROUTES_FOUND' }).code).toBe('NO_ROUTE');
    expect(parseJupiterError(400, { error: 'Query parameter outputMint cannot be parsed: Invalid' }).code).toBe('INVALID_TOKEN');
    expect(parseJupiterError(429, {}).code).toBe('RATE_LIMITED');
  });
  it('Relay', () => {
    expect(parseRelayError(401, { message: 'Please provide an api key', errorCode: 'UNAUTHORIZED_QUOTE' }).code).toBe('PROVIDER_UNAVAILABLE');
    expect(parseRelayError(400, { message: 'Amount is too low' }).code).toBe('AMOUNT_BELOW_MINIMUM');
  });
  it('approveSpender décode le spender', () => {
    const spender = '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae';
    const data = '0x095ea7b3' + spender.slice(2).padStart(64, '0') + 'f'.repeat(64);
    expect(approveSpender(data)).toBe(spender);
    expect(approveSpender('0xdeadbeef')).toBeNull();
  });
});

describe('sélection', () => {
  it("pickMostRelevant préfère l'erreur actionnable", () => {
    const e = pickMostRelevant([
      new SwapError('NO_ROUTE', 'x'),
      new SwapError('NETWORK', 'y'),
      new SwapError('AMOUNT_BELOW_MINIMUM', 'z'),
    ])!;
    expect(e.code).toBe('AMOUNT_BELOW_MINIMUM');
    expect(pickMostRelevant([new SwapError('NO_ROUTE', 'x'), new SwapError('NETWORK', 'y')])!.code).toBe('NETWORK');
    expect(pickMostRelevant([])).toBeNull();
  });
  const base: SwapQuote = {
    fromAmount: 1n, toAmount: 10n, toAmountMin: 9n,
    fromToken: { address: 'a', symbol: '', decimals: -1 }, toToken: { address: 'b', symbol: '', decimals: -1 },
    approvalAddress: null, toolName: 'X', gasCostUsd: 0, gasCostNative: 0n, gasToken: null, feeCostUsd: 0,
    durationSec: 0, fromAmountUsd: 0, toAmountUsd: 0, slippage: 0.005, tx: { type: 'solana', data: '' },
  };
  it('pickBest = plus gros toAmountMin', () => {
    expect(pickBest([{ ...base, toolName: 'A', toAmountMin: 9n }, { ...base, toolName: 'B', toAmountMin: 11n }])!.toolName).toBe('B');
    expect(pickBest([])).toBeNull();
  });
  it('normalizeQuote complète symbole/décimales', () => {
    const q = normalizeQuote(base, {
      fromChainId: 'solana', toChainId: 'solana', fromToken: 'a', toToken: 'b', fromAmount: '1', fromAddress: '', toAddress: '',
      fromTokenInfo: { symbol: 'SOL', decimals: 9 }, toTokenInfo: { symbol: 'USDC', decimals: 6 },
    });
    expect(q.fromToken).toMatchObject({ symbol: 'SOL', decimals: 9 });
    expect(q.toToken).toMatchObject({ symbol: 'USDC', decimals: 6 });
  });
  it('adresses', () => {
    expect(isEvmAddress('0x28C6c06298d514Db089934071355E5743bf21d60')).toBe(true);
    expect(isSolanaAddress('5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9')).toBe(true);
    expect(isSolanaAddress('0x28C6c06298d514Db089934071355E5743bf21d60')).toBe(false);
  });
  it('getBestQuote refuse une adresse de réception invalide AVANT tout appel réseau', async () => {
    await expect(
      getBestQuote({ fromChainId: 'ethereum', toChainId: 'solana', fromToken: 'x', toToken: 'y', fromAmount: '1', fromAddress: '0x28C6c06298d514Db089934071355E5743bf21d60', toAddress: '' }),
    ).rejects.toMatchObject({ code: 'INVALID_ADDRESS' });
  });
});
