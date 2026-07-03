import {
  parseAmount,
  assertSufficientFunds,
  formatAmount,
  formatBalance,
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

  it('formatBalance tronque à 6 décimales sans arrondir', () => {
    // 1.234567891 ETH -> tronqué (pas arrondi) à 1.234567
    expect(formatBalance(1234567891234567891n, ETH, 6)).toBe('1.234567');
    expect(formatBalance(10n ** 18n, ETH)).toBe('1');
    expect(formatBalance(5n * 10n ** 17n, ETH)).toBe('0.5');
    expect(formatBalance(0n, ETH)).toBe('0');
  });

  it('formatBalance retire les zéros de fin et gère la poussière', () => {
    expect(formatBalance(1500000000000000000n, ETH, 6)).toBe('1.5'); // pas 1.500000
    // 1 wei : non nul mais sous le seuil d'affichage
    expect(formatBalance(1n, ETH, 6)).toBe('<0.000001');
    // respecte un maxDecimals différent
    expect(formatBalance(1234567891234567891n, ETH, 4)).toBe('1.2345');
  });

  it('WalletError est bien une instance repérable', () => {
    const e = new WalletError('INVALID_AMOUNT', 'x');
    expect(e).toBeInstanceOf(WalletError);
    expect(e).toBeInstanceOf(Error);
  });
});
