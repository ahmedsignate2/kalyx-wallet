import {
  parseAmount,
  assertSufficientFunds,
  formatAmount,
} from './amount';
import { isWalletError, WalletError } from '../errors';

const ETH = 18;

function expectCode(fn: () => unknown, code: string) {
  try {
    fn();
    throw new Error('aurait dû lever');
  } catch (e) {
    expect(isWalletError(e)).toBe(true);
    if (isWalletError(e)) expect(e.code).toBe(code);
  }
}

describe('validation des montants', () => {
  it('convertit une saisie décimale en wei (bigint)', () => {
    expect(parseAmount('1', ETH).raw).toBe(10n ** 18n);
    expect(parseAmount('0.5', ETH).raw).toBe(5n * 10n ** 17n);
    // Accepte la virgule française.
    expect(parseAmount('0,5', ETH).raw).toBe(5n * 10n ** 17n);
  });

  it('rejette le vide, le non-numérique, le négatif et le zéro', () => {
    expectCode(() => parseAmount('', ETH), 'INVALID_AMOUNT');
    expectCode(() => parseAmount('abc', ETH), 'INVALID_AMOUNT');
    expectCode(() => parseAmount('-1', ETH), 'INVALID_AMOUNT');
    expectCode(() => parseAmount('.', ETH), 'INVALID_AMOUNT');
    expectCode(() => parseAmount('0', ETH), 'AMOUNT_TOO_SMALL');
  });

  it('rejette trop de décimales pour le token', () => {
    // 7 décimales sur un token à 6 (USDC).
    expectCode(() => parseAmount('1.1234567', 6), 'INVALID_AMOUNT');
    // Mais 6 décimales passent.
    expect(parseAmount('1.123456', 6).raw).toBe(1123456n);
  });

  it('assertSufficientFunds prend en compte les frais', () => {
    // 1 ETH dispo, on envoie 0.9 + 0.05 de frais -> OK.
    expect(() =>
      assertSufficientFunds({
        amount: 9n * 10n ** 17n,
        fee: 5n * 10n ** 16n,
        balance: 10n ** 18n,
      }),
    ).not.toThrow();

    // 1 ETH dispo, on envoie 1 + frais -> insuffisant.
    expectCode(
      () =>
        assertSufficientFunds({
          amount: 10n ** 18n,
          fee: 1n,
          balance: 10n ** 18n,
        }),
      'INSUFFICIENT_FUNDS',
    );
  });

  it('formatAmount est l’inverse de parseAmount', () => {
    const parsed = parseAmount('12.34', ETH);
    expect(formatAmount(parsed.raw, ETH)).toBe('12.34');
  });

  it('WalletError est bien une instance repérable', () => {
    const e = new WalletError('INVALID_AMOUNT', 'x');
    expect(e).toBeInstanceOf(WalletError);
    expect(e).toBeInstanceOf(Error);
  });
});
