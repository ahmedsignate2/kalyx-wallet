/**
 * Mouvement de l'extension : les MÊMES valeurs que l'app (ui/motion.ts de
 * l'app) — durées, courbe de sortie, cascade de 45 ms sur 12 éléments au plus.
 * Chaque animation répond à un changement d'état ; aucune ne rejoue quand
 * l'écran se redessine pour une simple actualisation.
 * Le réglage système « réduire les animations » coupe tout.
 */
export const DURATION = { instant: 120, fast: 220, base: 380, slow: 600 } as const;
export const CASCADE_DELAY_MS = 45;
export const CASCADE_MAX = 12;

export const reducedMotion = (): boolean => {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

export const cascadeDelay = (i: number): number => (i < CASCADE_MAX ? i * CASCADE_DELAY_MS : 0);

/** Entrée en cascade : fondu + légère montée, élément après élément. */
export function cascade(els: Iterable<Element>): void {
  if (reducedMotion()) return;
  let i = 0;
  for (const el of els) {
    if (!(el instanceof HTMLElement)) continue;
    el.classList.add('rise');
    el.style.animationDelay = `${cascadeDelay(i++)}ms`;
  }
}

/** Une valeur qui compte vers sa cible (solde) au lieu de sauter ; le texte final est exact. */
export function countUp(el: HTMLElement, from: number, to: number, format: (n: number) => string, duration = 700, render?: (el: HTMLElement, n: number) => void): void {
  const put = (n: number) => (render ? render(el, n) : (el.textContent = format(n)));
  if (reducedMotion() || from === to || !Number.isFinite(from) || !Number.isFinite(to)) {
    put(to);
    return;
  }
  const start = performance.now();
  // Courbe de sortie de l'app (0.16, 1, 0.3, 1), approchée par une puissance.
  const ease = (x: number) => 1 - Math.pow(1 - x, 4);
  const step = (now: number) => {
    if (!el.isConnected) return;
    const p = Math.min(1, (now - start) / duration);
    put(from + (to - from) * ease(p));
    if (p < 1) requestAnimationFrame(step);
    else put(to);
  };
  requestAnimationFrame(step);
}

/** Passage d'un écran à l'autre : le nouvel écran glisse depuis la droite (aller) ou la gauche (retour). */
export function navIn(app: HTMLElement, dir: 'fwd' | 'back'): void {
  if (reducedMotion()) return;
  app.classList.remove('nav-fwd', 'nav-back');
  void app.offsetWidth;
  app.classList.add(dir === 'fwd' ? 'nav-fwd' : 'nav-back');
  setTimeout(() => app.classList.remove('nav-fwd', 'nav-back'), DURATION.base + 40);
}

/** Pulsation de succès (copie, validation). */
export function pulse(el: HTMLElement): void {
  if (reducedMotion()) return;
  el.classList.remove('pulse');
  void el.offsetWidth;
  el.classList.add('pulse');
}
