import { evmReserveFromFeeData, solanaReserveFromPriorityFees, SOL_BASE_FEE } from './gasReserve';

describe('réserve de gas dynamique', () => {
  it('EVM : (maxFee ?? gasPrice) × 250k × 1,15', () => {
    // 20 gwei → 20e9 × 250000 × 1.15 = 5.75e15 wei = 0.00575 ETH
    expect(evmReserveFromFeeData({ maxFeePerGas: 20_000_000_000n, gasPrice: null })).toBe(5_750_000_000_000_000n);
    // legacy
    expect(evmReserveFromFeeData({ maxFeePerGas: null, gasPrice: 1_000_000_000n })).toBe(287_500_000_000_000n);
    expect(evmReserveFromFeeData({ maxFeePerGas: null, gasPrice: null })).toBe(0n);
  });
  it('Solana : base 5000 + p75 des priorités (µlamports/CU × 400k CU), plafonné, ×1,15', () => {
    // réseau calme (tout à 0) → 5000 × 1.15 = 5750 lamports
    expect(solanaReserveFromPriorityFees([0, 0, 0, 0])).toBe(5_750n);
    // p75 = 1000 µlamports/CU → 1000 × 400000 / 1e6 = 400 lamports de priorité
    expect(solanaReserveFromPriorityFees([0, 0, 0, 1000])).toBe(((SOL_BASE_FEE + 400n) * 115n) / 100n);
    // plafond 5000 µlamports/CU → 2000 lamports max de priorité
    expect(solanaReserveFromPriorityFees([1_000_000])).toBe(((SOL_BASE_FEE + 2_000n) * 115n) / 100n);
    expect(solanaReserveFromPriorityFees([])).toBe(5_750n);
  });
});
