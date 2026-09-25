import {
  evmReserveFromFeeData,
  solanaReserveFromPriorityFees,
  estimateGasReserve,
  SOL_BASE_FEE,
  BTC_TYPICAL_VBYTES,
} from './gasReserve';

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

describe('réserve Bitcoin', () => {
  it('est ESTIMÉE sur le taux du réseau, plus figée à 1 500', async () => {
    /*
     * 1 500 satoshis étaient renvoyés en dur, en se déclarant estimés
     * (`live: true`). Faux deux fois : rien n'était estimé, et 1 500 ne couvrent
     * pas une transaction dès ~10 sat/vB. Le « montant disponible » était donc
     * surévalué et un envoi du solde entier échouait après coup — sur un montant
     * que l'app venait de proposer.
     */
    const adapter = {
      config: { family: 'bitcoin' },
      getFeeRates: async () => ({ slow: 10, normal: 50, fast: 80 }),
    } as never;
    const r = await estimateGasReserve(adapter);
    expect(r.live).toBe(true);
    // 50 sat/vB × 141 vB × 1,15 ≈ 8 100 sats, très au-dessus de l'ancien 1 500.
    expect(r.raw).toBeGreaterThan(5_000n);
    expect(r.raw).toBe((50n * BTC_TYPICAL_VBYTES * 115n) / 100n);
  });

  it('suit le réseau à la baisse comme à la hausse', async () => {
    const at = async (normal: number) =>
      (await estimateGasReserve({ config: { family: 'bitcoin' }, getFeeRates: async () => ({ slow: 1, normal, fast: normal }) } as never)).raw;
    expect(await at(2)).toBeLessThan(await at(100));
  });

  it('retombe sur le repli si l\'adapter ne sait pas estimer', async () => {
    const r = await estimateGasReserve({ config: { family: 'bitcoin' } } as never);
    expect(r.live).toBe(false);
  });
});
