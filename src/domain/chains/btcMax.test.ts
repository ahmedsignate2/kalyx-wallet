import { maxSendableBtc, selectUtxos, estimateVsize } from './btcTx';

const u = (value: number, i: number) => ({ txid: `${i}`.padStart(64, '0'), vout: 0, value }) as never;

describe('Max Bitcoin', () => {
  it('paie les frais de TOUTES les pièces, et ce montant est bien payable', () => {
    const utxos = [u(50_000, 1), u(30_000, 2), u(20_000, 3)];
    const m = maxSendableBtc(utxos, 10, 'p2wpkh');
    expect(m.inputs).toBe(3);
    expect(m.fee).toBe(BigInt(Math.ceil(estimateVsize(3, ['p2wpkh']) * 10)));
    expect(m.amount).toBe(100_000n - m.fee);
    // La sélection réelle accepte exactement ce montant, sans monnaie rendue.
    const sel = selectUtxos(utxos, m.amount, 10, 'p2wpkh');
    expect(sel).not.toBeNull();
    expect(sel!.inputs).toHaveLength(3);
    expect(sel!.change).toBe(0n);
  });

  it('ignore les pièces qui coûtent plus qu’elles n’apportent ; 0 si le reste est de la poussière', () => {
    const m = maxSendableBtc([u(80_000, 1), u(500, 2)], 20, 'p2wpkh');
    expect(m.inputs).toBe(1);
    expect(maxSendableBtc([u(700, 1)], 5, 'p2wpkh').amount).toBe(0n);
  });
});
