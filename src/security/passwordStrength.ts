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

export function passwordStrength(pwd: string): Strength {
  if (!pwd) return { level: 0, key: 'strengthWeak' };
  const lower = pwd.toLowerCase();
  const core = lower.replace(/[^a-z0-9]/g, '');
  const weak: Strength = { level: 1, key: 'strengthWeak' };

  if (pwd.length < 10) return weak;
  if (/^\d+$/.test(pwd)) return weak;
  if (/^(.)\1+$/.test(pwd) || isSequence(core)) return weak;
  // Un mot connu, éventuellement suivi de chiffres ou de symboles (« Password2024! »).
  const stripped = core.replace(/\d+$/, '');
  if (COMMON.some((w) => stripped === w || (lower.includes(w) && pwd.length < w.length + 6))) return weak;

  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pwd)).length;
  // Phrase de passe : plusieurs mots, longue — forte même sans symboles.
  const words = pwd.trim().split(/\s+/).filter((w) => w.length >= 3).length;
  if ((pwd.length >= 20 && words >= 4) || pwd.length >= 14 && classes >= 2 || (pwd.length >= 12 && classes >= 3)) {
    return { level: 3, key: 'strengthStrong' };
  }
  if (classes >= 2) return { level: 2, key: 'strengthMedium' };
  return weak;
}
