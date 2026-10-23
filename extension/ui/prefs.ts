/**
 * PRÉFÉRENCES D'AFFICHAGE, propres à cet ordinateur : thème, mode Débutant /
 * Expert, sons. Lues de façon SYNCHRONE (localStorage de l'extension) pour
 * que la première image soit déjà la bonne — public/theme-boot.js lit la même
 * clé avant tout affichage. Rien de sensible ici : aucune clé, aucun compte.
 */
export type Theme = 'dark' | 'light' | 'system';
export type Mode = 'beginner' | 'expert';

const K = { theme: 'kalyx.theme', mode: 'kalyx.mode', sounds: 'kalyx.sounds' } as const;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, v: string): void {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* stockage indisponible : le choix vaut pour cette fenêtre seulement */
  }
}

/** Nuit par défaut. */
export const getTheme = (): Theme => {
  const v = read(K.theme);
  return v === 'light' || v === 'system' ? v : 'dark';
};
/** Débutant par défaut : l'essentiel d'abord, le technique replié. */
export const getMode = (): Mode => (read(K.mode) === 'expert' ? 'expert' : 'beginner');
export const isExpert = (): boolean => getMode() === 'expert';
/** Sons coupés par défaut. */
export const soundsOn = (): boolean => read(K.sounds) === '1';

/** Même règle que public/theme-boot.js : Crème si choisi, ou « Système » sur un système clair. */
export function applyTheme(doc: Document = document): void {
  const c = getTheme();
  let light = c === 'light';
  if (c === 'system') {
    try {
      light = matchMedia('(prefers-color-scheme: light)').matches;
    } catch {
      light = false;
    }
  }
  if (light) doc.documentElement.setAttribute('data-theme', 'light');
  else doc.documentElement.removeAttribute('data-theme');
}

export function setTheme(v: Theme): void {
  write(K.theme, v);
  applyTheme();
}
export const setMode = (v: Mode): void => write(K.mode, v);
export const setSounds = (on: boolean): void => write(K.sounds, on ? '1' : '0');
