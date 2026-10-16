import { mergeFailed } from './merge';

describe('Earn : lecture ratée ≠ zéro', () => {
  it('garde les dernières valeurs connues des protocoles non lus', () => {
    const prev = { balances: { underlying: { a: 5n, b: 7n }, gas: { a: 1n, b: 2n } }, positions: [{ protocolId: 'a', balance: 10n, decimals: 18 }, { protocolId: 'b', balance: 20n, decimals: 18 }] };
    const next = { balances: { underlying: { a: 6n }, gas: { a: 1n } }, positions: [{ protocolId: 'a', balance: 11n, decimals: 18 }], failed: ['b'] };
    const m = mergeFailed(prev, next);
    expect(m.balances.underlying).toEqual({ a: 6n, b: 7n });
    expect(m.positions.map((p) => [p.protocolId, p.balance])).toEqual([['a', 11n], ['b', 20n]]);
    expect(mergeFailed(null, next).positions).toHaveLength(1);
  });
});
