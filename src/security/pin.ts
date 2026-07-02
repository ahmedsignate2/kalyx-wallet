/**
 * Politique de PIN + limitation des tentatives (anti-brute-force).
 *
 * Logique pure (testable) : la vérification réelle du PIN se fait via le
 * déchiffrement du coffre (voir vault.ts). Ici on valide la robustesse du PIN
 * choisi et on calcule le verrouillage progressif après des échecs.
 */
import { WalletError } from '../domain/errors';

export const PIN_MIN = 6;
export const PIN_MAX = 12;

export interface PinCheck {
  ok: boolean;
  reason?: 'LENGTH' | 'NON_DIGIT' | 'TOO_SIMPLE';
}

/** Valide un PIN : longueur, chiffres uniquement, pas trop trivial. */
export function checkPin(pin: string): PinCheck {
  if (!/^\d+$/.test(pin)) return { ok: false, reason: 'NON_DIGIT' };
  if (pin.length < PIN_MIN || pin.length > PIN_MAX) return { ok: false, reason: 'LENGTH' };
  if (isTooSimple(pin)) return { ok: false, reason: 'TOO_SIMPLE' };
  return { ok: true };
}

export function assertValidPin(pin: string): void {
  const c = checkPin(pin);
  if (!c.ok) {
    throw new WalletError('INVALID_PIN', `PIN invalide (${c.reason})`);
  }
}

function isTooSimple(pin: string): boolean {
  // Tous identiques (000000), ou suite croissante/décroissante (123456, 654321).
  if (/^(\d)\1+$/.test(pin)) return true;
  const asc = pin.split('').every((d, i, a) => i === 0 || +d === +a[i - 1] + 1);
  const desc = pin.split('').every((d, i, a) => i === 0 || +d === +a[i - 1] - 1);
  return asc || desc;
}

// Verrouillage progressif indexé par nombre d'échecs consécutifs.
// 5 essais libres, puis délais croissants.
const LOCK_SCHEDULE_MS = [0, 0, 0, 0, 0, 0, 30_000, 60_000, 300_000, 900_000, 3_600_000];

/** Millisecondes restantes avant de pouvoir réessayer (0 si déverrouillé). */
export function lockRemainingMs(
  failedAttempts: number,
  lastFailedAt: number,
  now: number,
): number {
  if (failedAttempts <= 0) return 0;
  const idx = Math.min(failedAttempts, LOCK_SCHEDULE_MS.length - 1);
  const wait = LOCK_SCHEDULE_MS[idx];
  return Math.max(0, lastFailedAt + wait - now);
}

export function isLockedOut(
  failedAttempts: number,
  lastFailedAt: number,
  now: number,
): boolean {
  return lockRemainingMs(failedAttempts, lastFailedAt, now) > 0;
}
