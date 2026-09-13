import {
  createBackupChallenge,
  verifyBackupChallenge,
  verifyFullMnemonic,
  RandomInt,
} from './backupChallenge';

const PHRASE =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
// 12 mots : les 11 premiers "abandon", le 12e "about".

// RNG déterministe : renvoie une séquence fixe (modulo la borne) pour des tests reproductibles.
function seededRandom(seq: number[]): RandomInt {
  let i = 0;
  return (maxExclusive: number) => {
    const v = seq[i % seq.length];
    i++;
    return v % maxExclusive;
  };
}

describe('challenge de sauvegarde de seed', () => {
  it('génère le bon nombre de positions, chacune avec la bonne option présente', () => {
    const challenge = createBackupChallenge(PHRASE, {
      count: 3,
      optionsPerWord: 4,
      random: seededRandom([0, 5, 11, 2, 7, 9, 1, 3, 8]),
    });
    expect(challenge).toHaveLength(3);
    for (const c of challenge) {
      expect(c.options).toHaveLength(4);
      expect(c.position).toBeGreaterThanOrEqual(1);
      expect(c.position).toBeLessThanOrEqual(12);
      // Le mot correct de cette position doit figurer parmi les options.
      const correct = PHRASE.split(' ')[c.position - 1];
      expect(c.options).toContain(correct);
    }
  });

  it('positions distinctes et triées', () => {
    const challenge = createBackupChallenge(PHRASE, {
      count: 4,
      random: seededRandom([11, 0, 5, 8, 2, 3, 7, 1]),
    });
    const positions = challenge.map((c) => c.position);
    expect(new Set(positions).size).toBe(positions.length);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('verifyBackupChallenge accepte les bonnes réponses et rejette les mauvaises', () => {
    const good = [
      { position: 1, word: 'abandon' },
      { position: 12, word: 'about' },
    ];
    expect(verifyBackupChallenge(PHRASE, good)).toBe(true);

    expect(
      verifyBackupChallenge(PHRASE, [{ position: 12, word: 'abandon' }]),
    ).toBe(false);
    // Casse/espaces tolérés.
    expect(
      verifyBackupChallenge(PHRASE, [{ position: 12, word: '  ABOUT ' }]),
    ).toBe(true);
    // Aucune réponse -> échec.
    expect(verifyBackupChallenge(PHRASE, [])).toBe(false);
    // Position hors bornes -> échec.
    expect(verifyBackupChallenge(PHRASE, [{ position: 99, word: 'about' }])).toBe(false);
  });

  it('verifyFullMnemonic : re-saisie exacte valide, sinon échec', () => {
    expect(verifyFullMnemonic(PHRASE, PHRASE)).toBe(true);
    expect(verifyFullMnemonic(PHRASE, `  ${PHRASE.toUpperCase()} `)).toBe(true);
    // Un mot différent -> faux (et de toute façon checksum cassé).
    expect(verifyFullMnemonic(PHRASE, PHRASE.replace('about', 'zoo'))).toBe(false);
    // Ordre inversé -> faux.
    const reversed = PHRASE.split(' ').reverse().join(' ');
    expect(verifyFullMnemonic(PHRASE, reversed)).toBe(false);
  });
});

describe('unknownWords', () => {
  const { unknownWords } = require('./backupChallenge');
  it('signale les mots hors BIP-39', () => {
    expect(unknownWords('abandon ability kalyx zoo')).toEqual(['kalyx']);
    expect(unknownWords('  Abandon   ABILITY ')).toEqual([]);
    expect(unknownWords('')).toEqual([]);
  });
});
