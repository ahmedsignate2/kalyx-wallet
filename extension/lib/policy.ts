/**
 * Règles du mot de passe et freinage des essais.
 *
 * Le mot de passe protège un coffre qui vit sur un ordinateur : un malware qui
 * copie le profil peut le tester hors ligne. Il doit donc être fort — même
 * jugement que pour le mot de passe des sauvegardes du mobile
 * (src/security/passwordStrength) : courts, suites, mots de passe connus refusés.
 *
 * Le freinage, lui, ne protège que les essais EN LIGNE (quelqu'un devant
 * l'ordinateur) ; contre une copie du coffre, seul le scrypt compte.
 */
import { passwordStrength, MIN_BACKUP_LEVEL } from '../../src/security/passwordStrength';

export const MIN_PASSWORD_LENGTH = 8;

export function passwordAccepted(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH && passwordStrength(password).level >= MIN_BACKUP_LEVEL;
}

export interface Throttle {
  failures: number;
  /** Prochain essai autorisé (ms epoch). */
  until: number;
}

export const NO_THROTTLE: Throttle = { failures: 0, until: 0 };

/** Essais libres avant le premier délai. */
const FREE_TRIES = 5;
const FIRST_DELAY_MS = 30_000;
const MAX_DELAY_MS = 15 * 60_000;

/** Attente restante avant le prochain essai (0 = autorisé). */
export function waitMs(t: Throttle, now: number): number {
  return Math.max(0, t.until - now);
}

/** Après un mauvais mot de passe : à partir du 5e, 30 s, puis le double à chaque fois, plafonné à 15 min. */
export function afterFailure(t: Throttle, now: number): Throttle {
  const failures = t.failures + 1;
  if (failures < FREE_TRIES) return { failures, until: 0 };
  const delay = Math.min(MAX_DELAY_MS, FIRST_DELAY_MS * 2 ** (failures - FREE_TRIES));
  return { failures, until: now + delay };
}

/** Durées d'auto-verrouillage proposées (minutes). */
export const AUTO_LOCK_CHOICES = [1, 5, 15, 30, 60] as const;
export const DEFAULT_AUTO_LOCK_MIN = 15;

export function validAutoLock(min: unknown): min is (typeof AUTO_LOCK_CHOICES)[number] {
  return typeof min === 'number' && (AUTO_LOCK_CHOICES as readonly number[]).includes(min);
}

/** Code que la page d'onboarding joint pour tout effacer (mot de passe oublié) : jamais envoyé par erreur. */
export const RESET_CONFIRM = 'ERASE-ALL-KALYX-DATA';
