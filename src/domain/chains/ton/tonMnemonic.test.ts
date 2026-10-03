import { ed25519 } from '@noble/curves/ed25519';
import { hex } from '@scure/base';
import {
  tonWords,
  isValidTonMnemonic,
  tonMnemonicNeedsPassword,
  tonSeedFromMnemonic,
  TON_MNEMONIC_WORDS,
} from './tonMnemonic';
import { wordlist } from '@scure/bip39/wordlists/english';
import VECTORS from './tonkeeper-vectors.json';

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

/*
 * Vecteurs officiels de `@ton/crypto` (src/mnemonic/mnemonic.spec.ts) et cas
 * produits avec les bibliothèques officielles — provenance détaillée dans
 * `tonKeys.test.ts`.
 */
const official = VECTORS.keys.filter((k) => k.source.startsWith('@ton/crypto'));
const both12 = VECTORS.keys.find((k) => k.source.includes('AUSSI en TON'))!;
const plainBip39 = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('tonSeedFromMnemonic — interopérabilité', () => {
  /*
   * LE test qui manquait : les précédents vérifiaient le déterminisme et les
   * longueurs, pas que la graine est CELLE de l'écosystème. Une dérivation fausse
   * ne plante pas ; elle montre un portefeuille vide.
   */
  it.each(official.map((k) => [k.phrase.split(' ').slice(0, 3).join(' '), k]))(
    'rend la graine officielle de « %s… »',
    (_, k) => {
      expect(hex.encode(tonSeedFromMnemonic(k.phrase))).toBe(k.seed);
    },
  );
});

describe('isValidTonMnemonic — reproduit mnemonicValidate de @ton/crypto', () => {
  it('les cinq phrases officielles sont valides', () => {
    for (const k of official) expect(isValidTonMnemonic(k.phrase)).toBe(true);
  });

  /*
   * L'ANCIENNE RÈGLE ÉTAIT FAUSSE. On exigeait 24 mots ; `@ton/crypto` ne
   * regarde pas la longueur. Cette phrase BIP-39 de 12 mots passe le contrôle
   * TON, et Tonkeeper la dérive donc en native : avec l'exigence des 24 mots, on
   * l'aurait dérivée en BIP-39, vers une autre adresse.
   */
  it('ne regarde PAS la longueur : une phrase de 12 mots peut être TON', () => {
    expect(tonWords(both12.phrase)).toHaveLength(12);
    expect(isValidTonMnemonic(both12.phrase)).toBe(true);
    expect(TON_MNEMONIC_WORDS).toBe(24); // longueur de GÉNÉRATION, pas de validité
  });

  it('un mot hors de la liste invalide la phrase', () => {
    expect(isValidTonMnemonic(VECTORS.invalid[0])).toBe(false);
    expect(isValidTonMnemonic('un deux trois')).toBe(false);
    expect(isValidTonMnemonic('')).toBe(false);
  });

  it('une phrase BIP-39 ordinaire n’est pas une phrase TON', () => {
    expect(isValidTonMnemonic(plainBip39)).toBe(false);
  });

  /*
   * Il DOIT exister des phrases valides et invalides : un contrôle qui répondrait
   * toujours pareil serait inutile et passerait inaperçu. Mots réels de la liste,
   * choisis de façon déterministe.
   */
  it('distingue réellement : on trouve des phrases valides et invalides', () => {
    let valides = 0;
    let invalides = 0;
    for (let i = 0; i < 2000 && (valides === 0 || invalides === 0); i++) {
      const phrase = Array.from({ length: 24 }, (_, w) => wordlist[(i * 7919 + w * 104729) % wordlist.length]).join(' ');
      if (isValidTonMnemonic(phrase)) valides++;
      else invalides++;
    }
    expect(invalides).toBeGreaterThan(0);
    expect(valides).toBeGreaterThan(0);
  });
});

describe('tonMnemonicNeedsPassword', () => {
  it('rend un booléen stable, et faux sur une phrase vide', () => {
    expect(tonMnemonicNeedsPassword('')).toBe(false);
    const first = tonMnemonicNeedsPassword(plainBip39);
    expect(typeof first).toBe('boolean');
    expect(tonMnemonicNeedsPassword(plainBip39)).toBe(first);
  });

  /** Une phrase valide sans mot de passe n'en attend pas : les deux s'excluent. */
  it('une phrase valide sans mot de passe n’en réclame pas', () => {
    for (const k of official) expect(tonMnemonicNeedsPassword(k.phrase)).toBe(false);
  });
});
