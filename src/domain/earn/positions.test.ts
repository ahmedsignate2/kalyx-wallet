import { formatAmount, formatBalance } from '../validation/amount';

// Régression « NaN € » : une poussière (< 1e-6) formatée par formatBalance
// donne « <0.000001 » → Number() = NaN. Le store doit utiliser formatAmount.
describe('montant numérique d’une position', () => {
  it('formatBalance n’est pas parsable pour une poussière, formatAmount si', () => {
    const dust = 123n; // 0.000000123 JitoSOL (9 décimales)
    expect(Number.isNaN(Number(formatBalance(dust, 9)))).toBe(true);
    expect(Number(formatAmount(dust, 9))).toBeCloseTo(1.23e-7);
  });
});
