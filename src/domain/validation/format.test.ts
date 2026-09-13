import { formatTokenAmount, formatNumber, formatInputAmount, formatFiat, formatPercent, formatDecimalString } from './format';

const E = 10n ** 18n;

describe('formatTokenAmount — précision selon la grandeur', () => {
  it('≥ 1 : max 4 décimales, milliers groupés', () => {
    expect(formatTokenAmount(1234567890000000000000n, 18)).toBe('1 234.5678');
    expect(formatTokenAmount(2n * E + E / 2n, 18)).toBe('2.5');
    expect(formatTokenAmount(E, 18)).toBe('1');
    expect(formatTokenAmount(1_000_000n * E, 18)).toBe('1 000 000');
    expect(formatTokenAmount(1_234_567n * E + E / 10n, 18, { compact: true })).toBe('1.23 M');
  });
  it('< 1 : 4 chiffres significatifs, max 8 décimales', () => {
    expect(formatTokenAmount(1_831_000_000_000_000n, 18)).toBe('0.001831'); // ex-0.001831000000000000
    expect(formatTokenAmount(37_710_000_000_000n, 18)).toBe('0.00003771');
    expect(formatTokenAmount(123_456_789_000_000_000n, 18)).toBe('0.1234'); // tronqué, pas arrondi
    expect(formatTokenAmount(5_750n, 9)).toBe('0.00000575'); // lamports
    expect(formatTokenAmount(1_931_000n, 9)).toBe('0.001931');
  });
  it('poussière et zéro', () => {
    expect(formatTokenAmount(1n, 18)).toBe('<0.00000001');
    expect(formatTokenAmount(0n, 18)).toBe('0');
  });
  it('tronque, n’arrondit jamais vers le haut', () => {
    expect(formatTokenAmount(1_999_999_999_999_999_999n, 18)).toBe('1.9999');
  });
  it('USDC (6 décimales)', () => {
    expect(formatTokenAmount(10_000_000n, 6)).toBe('10');
    expect(formatTokenAmount(9_942_379n, 6)).toBe('9.9423');
  });
});

describe('formatNumber', () => {
  it('même règle sur un nombre JS', () => {
    expect(formatNumber(0.0000372)).toBe('0.0000372');
    expect(formatNumber(1234.56789)).toBe('1 234.5678');
    expect(formatNumber(NaN)).toBe('0');
    expect(formatNumber(1e-7)).toBe('0.0000001');
  });
});

describe('formatInputAmount — MAX dans un champ', () => {
  it('max 8 décimales, jamais 18', () => {
    expect(formatInputAmount(1_831_000_000_000_000n, 18)).toBe('0.001831');
    expect(formatInputAmount(1_234_567_891_234_567_891n, 18)).toBe('1.23456789');
    expect(formatInputAmount(10_000_000n, 6)).toBe('10');
    expect(formatInputAmount(1n, 18)).toBe('0');
  });
});

describe('formatFiat / formatPercent', () => {
  it('fiat', () => {
    expect(formatFiat(1234.5)).toBe('1 234,50');
    expect(formatFiat(0.004)).toBe('<0,01');
    expect(formatFiat(NaN)).toBe('0,00');
    expect(formatFiat(-12.3)).toBe('-12,30');
    expect(formatFiat(1500, 0)).toBe('1 500');
  });
  it('pourcentage', () => {
    expect(formatPercent(3.5)).toBe('3.5 %');
    expect(formatPercent(12)).toBe('12 %');
    expect(formatPercent(2.247)).toBe('2.25 %');
    expect(formatPercent(NaN)).toBe('—');
  });
  it('formatDecimalString négatif', () => {
    expect(formatDecimalString('-0.5')).toBe('-0.5');
  });
});
