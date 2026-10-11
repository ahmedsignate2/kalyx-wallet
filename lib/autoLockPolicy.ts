/**
 * Décision de verrouillage au retour au premier plan (ui/AutoLock).
 *
 * Deux horloges : l'heure murale (`Date.now`, réglable par l'utilisateur) et
 * l'horloge monotone (`performance.now`, qui ne recule jamais mais peut
 * s'arrêter pendant la veille profonde). En usage honnête, l'heure murale
 * avance au moins autant que la monotone. Si elle a reculé — ou avance
 * nettement moins que la monotone — quelqu'un a changé l'heure : on verrouille.
 */

/** Écrans où la phrase ou la clé est AFFICHÉE : quitter l'app verrouille aussitôt. */
export const LOCK_IMMEDIATELY_ON = new Set(['/reveal-phrase', '/reveal-private-key']);

/** Tolérance entre les deux horloges (ajustement NTP, arrondis). */
const CLOCK_SKEW_MS = 2_000;

export interface AutoLockInput {
  /** Délai réglé, en minutes : -1 = jamais, 0 = immédiat. */
  autoLockMinutes: number;
  wallElapsedMs: number;
  monoElapsedMs: number;
  /** Écran affiché au passage en arrière-plan. */
  pathname: string | null;
}

export function shouldAutoLock({ autoLockMinutes, wallElapsedMs, monoElapsedMs, pathname }: AutoLockInput): boolean {
  if (pathname && LOCK_IMMEDIATELY_ON.has(pathname)) return true;
  if (autoLockMinutes < 0) return false; // « Jamais »
  // Heure reculée pendant l'absence : on ne peut plus rien mesurer de fiable.
  if (wallElapsedMs < 0 || wallElapsedMs + CLOCK_SKEW_MS < monoElapsedMs) return true;
  const threshold = autoLockMinutes * 60_000; // 0 = immédiat
  return Math.max(wallElapsedMs, monoElapsedMs) >= threshold;
}

/** Horloge monotone (ms) ; repli sur l'heure murale si l'environnement n'en a pas. */
export function monoNow(): number {
  const p = (globalThis as { performance?: { now?: () => number } }).performance;
  return typeof p?.now === 'function' ? p.now() : Date.now();
}
