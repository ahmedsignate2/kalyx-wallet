import { base58, base64 } from '@scure/base';
import { checkSwapQuote, lifiContractFor } from './guard';
import type { SwapQuote } from './lifi';

const ME = '0x552008c0f6870c2f77e5cC1d2eb9bdff03e30Ea0';
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const DIAMOND = '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE';
const tok = (address: string) => ({ address, symbol: 'X', decimals: 6, chainId: 8453 });

function evmQuote(over: Partial<SwapQuote> & { to?: string; data?: string; chainId?: number } = {}): SwapQuote {
  return {
    fromAmount: 5_000_000n, toAmount: 1n, toAmountMin: 1n,
    fromToken: tok(USDC_BASE), toToken: tok('0x0000000000000000000000000000000000000000'),
    approvalAddress: DIAMOND, toolName: 'test', gasCostUsd: 0, gasCostNative: 0n, gasToken: null,
    feeCostUsd: 0, durationSec: 0, fromAmountUsd: 0, toAmountUsd: 0, slippage: 0.005,
    tx: { type: 'evm', to: over.to ?? DIAMOND, data: over.data ?? `0xabcdef${'0'.repeat(24)}${ME.slice(2).toLowerCase()}`, value: 0n, chainId: over.chainId ?? 8453 },
    ...over,
  } as SwapQuote;
}
const key = (seed: number) => new Uint8Array(32).fill(seed);
/** Transaction Solana minimale (payeur = première clé), comme dans solanaTx.test.ts. */
function solTx(payer: Uint8Array): string {
  const m = [1, 0, 1, 2, ...payer, ...new Uint8Array(32), ...new Uint8Array(32), 1, 1, 1, 0, 0];
  return base64.encode(new Uint8Array([1, ...new Uint8Array(64), ...m]));
}
const expect8453 = { fromEvmChainId: 8453, fromToken: USDC_BASE, fromAmount: 5_000_000n, fromAddress: ME, toAddress: ME };

describe('Contrôle des devis d’échange', () => {
  it('accepte un devis LI.FI conforme', () => {
    expect(checkSwapQuote(evmQuote(), expect8453)).toEqual({ ok: true });
  });
  it('refuse un contrat, une autorisation, un réseau, un jeton ou un montant différents', () => {
    const EVIL = '0x' + 'e'.repeat(40);
    expect(checkSwapQuote(evmQuote({ to: EVIL }), expect8453)).toEqual({ ok: false, reason: 'UNKNOWN_CONTRACT' });
    expect(checkSwapQuote(evmQuote({ approvalAddress: EVIL }), expect8453)).toEqual({ ok: false, reason: 'UNKNOWN_SPENDER' });
    expect(checkSwapQuote(evmQuote({ chainId: 1 }), expect8453)).toEqual({ ok: false, reason: 'WRONG_CHAIN' });
    expect(checkSwapQuote(evmQuote({ fromToken: tok(EVIL) }), expect8453)).toEqual({ ok: false, reason: 'WRONG_TOKEN' });
    expect(checkSwapQuote(evmQuote({ fromAmount: 5_000_001n }), expect8453)).toEqual({ ok: false, reason: 'WRONG_AMOUNT' });
  });
  it('refuse un devis qui livre ailleurs', () => {
    const other = `0xabcdef${'0'.repeat(24)}${'1'.repeat(40)}`;
    expect(checkSwapQuote(evmQuote({ data: other }), expect8453)).toEqual({ ok: false, reason: 'RECEIVER_MISSING' });
  });
  it('pont vers Solana : la clé publique Solana doit figurer dans les données', () => {
    const sol = key(9);
    const data = `0xabcdef${Buffer.from(sol).toString('hex')}`;
    expect(checkSwapQuote(evmQuote({ data }), { ...expect8453, toAddress: base58.encode(sol) })).toEqual({ ok: true });
    expect(checkSwapQuote(evmQuote({ data }), { ...expect8453, toAddress: base58.encode(key(8)) }).ok).toBe(false);
  });
  it('contrats relevés : cas général et réseaux particuliers ; réseau inconnu refusé', () => {
    expect(lifiContractFor(1)).toBe(DIAMOND.toLowerCase());
    expect(lifiContractFor(324)).toBe('0x341e94069f53234fe6dabef707ad424830525715');
    expect(lifiContractFor(999_999)).toBeNull();
  });
  it('Solana : la transaction doit être payée par nous', () => {
    const me = key(7);
    const q = (data: string) => ({ ...evmQuote(), approvalAddress: null, tx: { type: 'solana' as const, data } });
    const e = { fromToken: 'x', fromAmount: 5_000_000n, fromAddress: base58.encode(me), toAddress: base58.encode(me) };
    expect(checkSwapQuote(q(solTx(me)), e)).toEqual({ ok: true });
    expect(checkSwapQuote(q(solTx(key(6))), e)).toEqual({ ok: false, reason: 'NOT_OUR_TX' });
  });

});
