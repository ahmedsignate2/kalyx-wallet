import { computeFeeTiers } from './gas';

describe('computeFeeTiers (EIP-1559)', () => {
  const fee = { maxFeePerGas: 50_000_000_000n, maxPriorityFeePerGas: 2_000_000_000n, gasPrice: null };
  const gasLimit = 21_000n;

  it('les frais croissent slow < normal < fast', () => {
    const t = computeFeeTiers(fee, gasLimit);
    expect(t.slow.costWei).toBeLessThan(t.normal.costWei);
    expect(t.normal.costWei).toBeLessThan(t.fast.costWei);
  });

  it('la priorité fast > normal > slow', () => {
    const t = computeFeeTiers(fee, gasLimit);
    expect(t.fast.maxPriorityFeePerGas).toBeGreaterThan(t.normal.maxPriorityFeePerGas);
    expect(t.normal.maxPriorityFeePerGas).toBeGreaterThan(t.slow.maxPriorityFeePerGas);
  });

  it('coût = maxFeePerGas × gasLimit', () => {
    const t = computeFeeTiers(fee, gasLimit);
    expect(t.normal.costWei).toBe(t.normal.maxFeePerGas * gasLimit);
  });

  it('repli legacy (gasPrice seul)', () => {
    const t = computeFeeTiers({ maxFeePerGas: null, maxPriorityFeePerGas: null, gasPrice: 10_000_000_000n }, 21_000n);
    expect(t.fast.maxFeePerGas).toBeGreaterThan(t.slow.maxFeePerGas);
    expect(t.normal.costWei).toBeGreaterThan(0n);
  });
});
