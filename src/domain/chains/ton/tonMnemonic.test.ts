import { ed25519 } from '@noble/curves/ed25519';
import { hex } from '@scure/base';
import {
  tonWords,
  isValidTonMnemonic,
  tonMnemonicNeedsPassword,
  tonSeedFromMnemonic,
  TON_MNEMONIC_WORDS,
} from './tonMnemonic';

/**
 * Phrase de 24 mots quelconque. Elle n'a aucune raison d'être une phrase TON
 * VALIDE — une phrase tirée au hasard a environ une chance sur 256 de l'être —
 * et c'est justement ce qui permet de tester la distinction.
 */
const WORDS24 = Array.from({ length: 24 }, (_, i) => `word${i}`).join(' ');

describe('tonWords', () => {
  it('normalise les espaces et la casse', () => {
    expect(tonWords('  Alpha   BÊTA\tgamma \n')).toEqual(['alpha', 'bêta', 'gamma']);
    expect(tonWords('')).toEqual([]);
    expect(tonWords('   ')).toEqual([]);
  });
});

describe('tonSeedFromMnemonic', () => {
  it('rend 32 octets, et toujours les mêmes', () => {
    const a = tonSeedFromMnemonic(WORDS24);
    const b = tonSeedFromMnemonic(WORDS24);
    expect(a).toHaveLength(32);
    expect(hex.encode(a)).toBe(hex.encode(b));
  });

  /*
   * La graine est utilisable telle quelle par ed25519 : c'est tout ce que
   * `signerFromRawKey` attendra. Si les 32 octets n'étaient pas au bon endroit,
   * cette dérivation lèverait ou produirait une clé publique instable.
   */
  it('la graine est une graine ed25519 exploitable', () => {
    const seed = tonSeedFromMnemonic(WORDS24);
    const pub = ed25519.getPublicKey(seed);
    expect(pub).toHaveLength(32);
    expect(hex.encode(ed25519.getPublicKey(seed))).toBe(hex.encode(pub));
  });

  /*
   * LE MOT DE PASSE CHANGE LA CLÉ. S'il était ignoré — une erreur facile, il
   * entre comme DONNÉES du HMAC et non comme clé — une phrase protégée
   * donnerait la même adresse avec ou sans, et l'utilisateur verrait un compte
   * vide sans comprendre pourquoi.
   */
  it('un mot de passe différent donne une graine différente', () => {
    const sans = hex.encode(tonSeedFromMnemonic(WORDS24));
    const avec = hex.encode(tonSeedFromMnemonic(WORDS24, 'secret'));
    expect(avec).not.toBe(sans);
    expect(hex.encode(tonSeedFromMnemonic(WORDS24, ''))).toBe(sans);
  });

  /** L'ordre des mots fait partie du secret : deux ordres, deux clés. */
  it('l’ordre des mots compte', () => {
    const inverse = tonWords(WORDS24).reverse().join(' ');
    expect(hex.encode(tonSeedFromMnemonic(inverse))).not.toBe(hex.encode(tonSeedFromMnemonic(WORDS24)));
  });

  it('refuse une phrase vide', () => {
    expect(() => tonSeedFromMnemonic('   ')).toThrow();
  });
});

describe('isValidTonMnemonic', () => {
  it('exige exactement 24 mots', () => {
    expect(TON_MNEMONIC_WORDS).toBe(24);
    expect(isValidTonMnemonic('un deux trois')).toBe(false);
    expect(isValidTonMnemonic(tonWords(WORDS24).slice(0, 23).join(' '))).toBe(false);
  });

  /*
   * La validité TON n'a AUCUN rapport avec BIP-39 : il n'y a pas de somme de
   * contrôle sur les mots, seulement un contrôle sur l'entropie dérivée. Une
   * phrase de 24 mots inventés a donc environ une chance sur 256 de passer — le
   * test vérifie que la réponse est stable et booléenne, pas qu'elle est vraie.
   */
  it('rend un verdict stable, sans se référer à BIP-39', () => {
    const first = isValidTonMnemonic(WORDS24);
    expect(typeof first).toBe('boolean');
    expect(isValidTonMnemonic(WORDS24)).toBe(first);
  });

  /*
   * Il DOIT exister des phrases valides et des phrases invalides : un contrôle
   * qui répondrait toujours pareil serait inutile et passerait inaperçu.
   */
  it('distingue réellement : on trouve des phrases valides et invalides', () => {
    let valides = 0;
    let invalides = 0;
    for (let i = 0; i < 400 && (valides === 0 || invalides === 0); i++) {
      const phrase = Array.from({ length: 24 }, (_, w) => `m${i}x${w}`).join(' ');
      if (isValidTonMnemonic(phrase)) valides++;
      else invalides++;
    }
    expect(invalides).toBeGreaterThan(0);
    expect(valides).toBeGreaterThan(0);
  });
});

describe('tonMnemonicNeedsPassword', () => {
  it('rend un booléen stable, et faux hors 24 mots', () => {
    expect(tonMnemonicNeedsPassword('un deux')).toBe(false);
    const first = tonMnemonicNeedsPassword(WORDS24);
    expect(typeof first).toBe('boolean');
    expect(tonMnemonicNeedsPassword(WORDS24)).toBe(first);
  });

  /** Une phrase valide sans mot de passe n'en attend pas : les deux s'excluent. */
  it('une phrase valide sans mot de passe n’en réclame pas', () => {
    for (let i = 0; i < 400; i++) {
      const phrase = Array.from({ length: 24 }, (_, w) => `p${i}y${w}`).join(' ');
      if (isValidTonMnemonic(phrase)) {
        expect(tonMnemonicNeedsPassword(phrase)).toBe(false);
        return;
      }
    }
  });
});
