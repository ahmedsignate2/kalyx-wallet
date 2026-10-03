/**
 * Force du mot de passe de SAUVEGARDE (fichier chiffré, Google Drive).
 *
 * Ce mot de passe est la seule protection du fichier une fois qu'il a quitté
 * le téléphone : quiconque obtient le fichier (compte Google compromis, copie
 * du fichier local) peut tester des mots de passe hors ligne, sans limite de
 * tentatives. L'ancienne règle — 8 caractères, n'importe lesquels — acceptait
 * « 12345678 » et « password », qui tombent en quelques secondes. On refuse
 * désormais les mots de passe faibles : courts, uniquement des chiffres, des
 * suites, ou des mots de passe connus.
 */

export type StrengthLevel = 0 | 1 | 2 | 3;
export interface Strength {
  level: StrengthLevel;
  key: 'strengthWeak' | 'strengthMedium' | 'strengthStrong';
}

/** Minimum pour enregistrer une sauvegarde. */
export const MIN_BACKUP_LEVEL: StrengthLevel = 2;

/** Mots de passe parmi les plus répandus (fuites publiques), et leurs variantes évidentes. */
const COMMON = [
  'password', 'motdepasse', 'azerty', 'qwerty', 'qwertz', 'letmein', 'welcome', 'bienvenue', 'admin', 'iloveyou', 'jetaime',
  'monkey', 'dragon', 'football', 'soleil', 'bonjour', 'princess', 'sunshine', 'master', 'shadow', 'secret', 'crypto',
  'bitcoin', 'ethereum', 'wallet', 'kalyx', 'solana', 'passw0rd', 'p@ssword', 'abc123', 'trustno1', 'loulou', 'doudou',
];

function isSequence(s: string): boolean {
  if (s.length < 4) return false;
  const codes = [...s.toLowerCase()].map((c) => c.charCodeAt(0));
  const asc = codes.every((c, i) => i === 0 || c === codes[i - 1] + 1);
  const desc = codes.every((c, i) => i === 0 || c === codes[i - 1] - 1);
  return asc || desc;
}

const KEYBOARD_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', 'azertyuiop', 'qsdfghjklm', 'wxcvbn', 'qwertzuiop', 'yxcvbnm', '1234567890'];

/**
 * Ce qui reste une fois retirés les motifs qu'un attaquant essaie en premier :
 * mots connus, rangées du clavier, suites (abcd, 4321) et répétitions (aaa,
 * abab). « Qwerty123456! » est long et a quatre sortes de caractères — mais
 * presque rien ne reste, et c'est ce reste qui fait la force réelle.
 */
function residual(core: string): string {
  let r = core;
  for (const w of COMMON) r = r.split(w).join('');
  for (const row of KEYBOARD_ROWS) {
    for (const line of [row, [...row].reverse().join('')]) {
      for (let len = line.length; len >= 4; len--) {
        for (let i = 0; i + len <= line.length; i++) r = r.split(line.slice(i, i + len)).join('');
      }
    }
  }
  // Suites de 4 et plus (codes consécutifs, montantes ou descendantes).
  const codes = [...r];
  const keep = new Array(codes.length).fill(true);
  for (let i = 0; i + 3 < codes.length; i++) {
    for (const step of [1, -1]) {
      let j = i;
      while (j + 1 < codes.length && codes[j + 1].charCodeAt(0) - codes[j].charCodeAt(0) === step) j++;
      if (j - i + 1 >= 4) for (let k = i; k <= j; k++) keep[k] = false;
    }
  }
  r = codes.filter((_, i) => keep[i]).join('');
  // Répétitions : un caractère trois fois et plus, un motif court répété.
  return r.replace(/(.)\1{2,}/g, '').replace(/(.{2,4})\1+/g, '');
}

export function passwordStrength(pwd: string): Strength {
  if (!pwd) return { level: 0, key: 'strengthWeak' };
  const lower = pwd.toLowerCase();
  // Lettres de TOUTES les écritures gardées (arabe, cyrillique…) : seuls les blancs et la ponctuation ASCII tombent.
  const core = lower.replace(/[\s!-/:-@[-`{-~]/g, '');
  const weak: Strength = { level: 1, key: 'strengthWeak' };

  if (pwd.length < 10) return weak;
  if (/^\d+$/.test(pwd)) return weak;
  if (/^(.)\1+$/.test(pwd) || isSequence(core)) return weak;
  // Un mot connu, éventuellement suivi de chiffres ou de symboles (« Password2024! »).
  const stripped = core.replace(/\d+$/, '');
  if (COMMON.some((w) => stripped === w || (lower.includes(w) && pwd.length < w.length + 6))) return weak;

  // Peu de caractères distincts (« aaaaaaaaaA1 », « ababab12ab ») ou presque rien hors motifs connus.
  if (new Set(lower).size < Math.max(5, Math.ceil(pwd.length / 3))) return weak;
  if (residual(core).length < 6) return weak;

  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pwd)).length;
  // Phrase de passe : plusieurs mots, longue — forte même sans symboles.
  const words = pwd.trim().split(/\s+/).filter((w) => w.length >= 3).length;
  if ((pwd.length >= 20 && words >= 4) || pwd.length >= 14 && classes >= 2 || (pwd.length >= 12 && classes >= 3)) {
    return { level: 3, key: 'strengthStrong' };
  }
  if (classes >= 2) return { level: 2, key: 'strengthMedium' };
  return weak;
}
