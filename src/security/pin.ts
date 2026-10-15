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

/**
 * Codes parmi les plus choisis (études de fuites de PIN à 6 chiffres) : motifs
 * du clavier, dates rondes, constantes. Les premiers essayés par quiconque
 * tient le téléphone.
 */
const COMMON_PINS = new Set([
  '112233', '121212', '123123', '123321', '147258', '159753', '258369', '369258', '147852', '963852', '789456', '102030',
  '101010', '696969', '520520', '131313', '111222', '000111', '100200', '777888', '112358', '314159', '271828', '007007',
  '420420', '159357', '852456', '741852', '963741', '123654', '456123', '321654', '987654', '135790', '246802', '111000',
]);

function isTooSimple(pin: string): boolean {
  // Tous identiques (000000), ou suite croissante/décroissante (123456, 654321).
  if (/^(\d)\1+$/.test(pin)) return true;
  const asc = pin.split('').every((d, i, a) => i === 0 || +d === +a[i - 1] + 1);
  const desc = pin.split('').every((d, i, a) => i === 0 || +d === +a[i - 1] - 1);
  if (asc || desc) return true;
  // Motif répété (121212, 123123, 112112) : un bloc de 1 à 3 chiffres, recopié.
  for (let p = 2; p <= 3; p++) {
    if (pin.length % p === 0 && pin.slice(0, p).repeat(pin.length / p) === pin) return true;
  }
  // Miroir (123321, 112211) : se devine aussi vite qu'il se retient.
  if (pin.length <= 8 && pin === pin.split('').reverse().join('')) return true;
  // Pas constant (135791, 246802…) : une suite, même avec un saut.
  const step = (+pin[1] - +pin[0] + 10) % 10;
  if (step !== 0 && pin.split('').every((d, i, a) => i === 0 || (+d - +a[i - 1] + 10) % 10 === step)) return true;
  return COMMON_PINS.has(pin);
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
  /*
   * Horloge reculée (réglage manuel, fuseau, batterie vidée) : `lastFailedAt`
   * est dans le futur et l'attente calculée pouvait valoir des mois. Jamais
   * plus que l'attente du palier ; le portefeuille ramène en plus la date à
   * maintenant (`lockRemainingNow`), pour que l'attente reprenne son décompte.
   */
  return Math.min(wait, Math.max(0, lastFailedAt + wait - now));
}

export function isLockedOut(
  failedAttempts: number,
  lastFailedAt: number,
  now: number,
): boolean {
  return lockRemainingMs(failedAttempts, lastFailedAt, now) > 0;
}
