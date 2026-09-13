/**
 * Vérification de la sauvegarde de la seed (écran "backup").
 *
 * Après avoir affiché la phrase, on demande à l'utilisateur de confirmer qu'il
 * l'a bien notée. Deux modes :
 *  - challenge : re-sélectionner quelques mots à des positions données ;
 *  - re-saisie complète : retaper toute la phrase.
 *
 * L'aléatoire est injectable pour rendre la logique testable de façon
 * déterministe. En production, la source par défaut est le CSPRNG.
 */
import { wordlist } from '@scure/bip39/wordlists/english';
import { getRandomBytes } from '../../crypto/random';
import { validateMnemonic } from '../../crypto/mnemonic';

export type RandomInt = (maxExclusive: number) => number;

/** Entier uniforme dans [0, maxExclusive) via CSPRNG (rejet du biais modulo). */
export const secureRandomInt: RandomInt = (maxExclusive: number): number => {
  if (maxExclusive <= 0) throw new Error('maxExclusive doit être > 0');
  const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const b = getRandomBytes(4);
    const n = ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
    if (n < limit) return n % maxExclusive;
  }
};

export interface WordChallenge {
  /** Position du mot dans la phrase (1-based, comme affiché à l'utilisateur). */
  position: number;
  /** Options mélangées, dont exactement une correcte. */
  options: string[];
}

export interface ChallengeOptions {
  /** Nombre de mots à faire confirmer. */
  count?: number;
  /** Nombre d'options proposées par mot (1 correcte + leurres). */
  optionsPerWord?: number;
  random?: RandomInt;
}

function normalizeWords(mnemonic: string): string[] {
  return mnemonic.trim().replace(/\s+/g, ' ').toLowerCase().split(' ');
}

function pickDistinct(count: number, maxExclusive: number, random: RandomInt): number[] {
  const chosen = new Set<number>();
  while (chosen.size < count && chosen.size < maxExclusive) {
    chosen.add(random(maxExclusive));
  }
  return [...chosen];
}

/** Construit un challenge : quelles positions vérifier + options par position. */
export function createBackupChallenge(
  mnemonic: string,
  opts: ChallengeOptions = {},
): WordChallenge[] {
  const words = normalizeWords(mnemonic);
  const count = Math.min(opts.count ?? 3, words.length);
  const optionsPerWord = Math.max(2, opts.optionsPerWord ?? 4);
  const random = opts.random ?? secureRandomInt;

  const positions = pickDistinct(count, words.length, random).sort((a, b) => a - b);

  return positions.map((idx) => {
    const correct = words[idx];
    const options = new Set<string>([correct]);
    while (options.size < optionsPerWord) {
      const decoy = wordlist[random(wordlist.length)];
      if (decoy !== correct) options.add(decoy);
    }
    // Mélange (Fisher-Yates).
    const arr = [...options];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = random(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return { position: idx + 1, options: arr };
  });
}

export interface ChallengeAnswer {
  position: number;
  word: string;
}

/** Vérifie que chaque réponse correspond au bon mot à sa position. */
export function verifyBackupChallenge(
  mnemonic: string,
  answers: ChallengeAnswer[],
): boolean {
  if (answers.length === 0) return false;
  const words = normalizeWords(mnemonic);
  return answers.every(
    (a) =>
      a.position >= 1 &&
      a.position <= words.length &&
      words[a.position - 1] === a.word.trim().toLowerCase(),
  );
}

/** Vérifie une re-saisie complète : identique à l'originale ET phrase valide. */
export function verifyFullMnemonic(original: string, reentered: string): boolean {
  const a = normalizeWords(original).join(' ');
  const b = normalizeWords(reentered).join(' ');
  return a === b && validateMnemonic(b);
}

/** Mots d'une phrase saisie qui ne sont PAS dans la liste BIP-39 (validation mot par mot, §4.9). */
export function unknownWords(phrase: string): string[] {
  const set = new Set<string>(wordlist);
  return phrase
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0 && !set.has(w));
}
