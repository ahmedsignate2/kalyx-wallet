import {
  checkPin,
  assertValidPin,
  lockRemainingMs,
  isLockedOut,
} from './pin';
import { isWalletError } from '../domain/errors';

describe('politique de PIN', () => {
  it('accepte un PIN robuste', () => {
    expect(checkPin('824193').ok).toBe(true);
  });

  it('rejette non-chiffres et longueurs hors bornes', () => {
    expect(checkPin('12ab56').reason).toBe('NON_DIGIT');
    expect(checkPin('123').reason).toBe('LENGTH'); // trop court
    expect(checkPin('1234567890123').reason).toBe('LENGTH'); // trop long
  });

  it('rejette les PIN triviaux', () => {
    expect(checkPin('000000').reason).toBe('TOO_SIMPLE'); // tous identiques
    expect(checkPin('123456').reason).toBe('TOO_SIMPLE'); // croissant
    expect(checkPin('654321').reason).toBe('TOO_SIMPLE'); // décroissant
  });

  it('assertValidPin lève WalletError(INVALID_PIN)', () => {
    try {
      assertValidPin('0000');
      throw new Error('aurait dû lever');
    } catch (e) {
      expect(isWalletError(e)).toBe(true);
      if (isWalletError(e)) expect(e.code).toBe('INVALID_PIN');
    }
  });
});

describe('limitation des tentatives (anti-brute-force)', () => {
  const T0 = 1_000_000;

  it('les 5 premiers échecs ne verrouillent pas', () => {
    for (let n = 0; n <= 5; n++) {
      expect(lockRemainingMs(n, T0, T0)).toBe(0);
    }
  });

  it('le 6e échec impose un délai, qui s’écoule avec le temps', () => {
    expect(lockRemainingMs(6, T0, T0)).toBe(30_000);
    expect(isLockedOut(6, T0, T0)).toBe(true);
    // 20 s plus tard : encore 10 s.
    expect(lockRemainingMs(6, T0, T0 + 20_000)).toBe(10_000);
    // 30 s plus tard : déverrouillé.
    expect(isLockedOut(6, T0, T0 + 30_000)).toBe(false);
  });

  it('le délai augmente avec le nombre d’échecs', () => {
    expect(lockRemainingMs(7, T0, T0)).toBe(60_000);
    expect(lockRemainingMs(8, T0, T0)).toBe(300_000);
    expect(lockRemainingMs(50, T0, T0)).toBe(3_600_000); // plafonné
  });
});
