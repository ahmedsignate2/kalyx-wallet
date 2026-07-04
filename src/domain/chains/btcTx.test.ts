import { estimateVsize, selectUtxos, DUST_SATS, type Utxo } from './btcTx';

const utxo = (value: number, i = 0): Utxo => ({ txid: 'a'.repeat(64), vout: i, value });

describe('estimateVsize', () => {
  it('croît avec entrées et sorties', () => {
    expect(estimateVsize(1, 2)).toBeLessThan(estimateVsize(2, 2));
    expect(estimateVsize(1, 1)).toBeLessThan(estimateVsize(1, 2));
    // 1 entrée, 2 sorties ≈ 10.5 + 68 + 62 = 140.5 → 141
    expect(estimateVsize(1, 2)).toBe(141);
  });
});

describe('selectUtxos', () => {
  it('choisit une pièce et rend la monnaie', () => {
    const sel = selectUtxos([utxo(100000)], 20000n, 10);
    expect(sel).not.toBeNull();
    expect(sel!.inputs).toHaveLength(1);
    // sum(100000) = target(20000) + fee + change
    expect(20000n + sel!.fee + sel!.change).toBe(100000n);
    expect(sel!.change).toBeGreaterThanOrEqual(DUST_SATS);
  });

  it('accumule plusieurs pièces si nécessaire', () => {
    const sel = selectUtxos([utxo(10000, 0), utxo(9000, 1), utxo(8000, 2)], 20000n, 5);
    expect(sel).not.toBeNull();
    expect(sel!.inputs.length).toBeGreaterThanOrEqual(3);
  });

  it('absorbe une monnaie « poussière » dans les frais (pas de sortie change)', () => {
    // Choisit une valeur telle que le reste après target+fee soit < DUST.
    const feeRate = 10;
    const target = 50000n;
    // feeWithChange = estimateVsize(1,2)*10 = 141*10 = 1410 ; il faut
    // sum >= 51410 ET change = sum-50000-1410 < 294 (poussière) → sum in [51410, 51704).
    // sum = 51500 → change 90 (< 294) → absorbé ; fee = sum - target = 1500.
    const sel = selectUtxos([utxo(51500)], target, feeRate);
    expect(sel).not.toBeNull();
    expect(sel!.change).toBe(0n);
    expect(sel!.fee).toBe(1500n);
  });

  it('renvoie null si solde insuffisant (frais compris)', () => {
    expect(selectUtxos([utxo(20000)], 20000n, 10)).toBeNull(); // pas de marge pour les frais
    expect(selectUtxos([], 1000n, 10)).toBeNull();
  });

  it('refuse un montant nul ou négatif', () => {
    expect(selectUtxos([utxo(100000)], 0n, 10)).toBeNull();
  });
});
