import { hex } from '@scure/base';
import { classifyRecoveryPhrase } from './recoveryPhrase';
import { resolveTonKey, tonKeyKind, tonPublicKeyFromPhrase } from '../chains/ton/tonKeys';
import { mnemonicToSeedSync } from '../../crypto/mnemonic';
import VECTORS from '../chains/ton/tonkeeper-vectors.json';

const official = VECTORS.keys.filter((k) => k.source.startsWith('@ton/crypto'));
const both = VECTORS.keys.find((k) => k.source.includes('AUSSI en TON'))!;
const art = VECTORS.keys.find((k) => k.phrase.endsWith(' art'))!;

describe('classifyRecoveryPhrase', () => {
  it('une phrase Tonkeeper ouvre un portefeuille TON seulement', () => {
    for (const k of official) expect(classifyRecoveryPhrase(k.phrase)).toBe('ton');
  });

  it('une phrase BIP-39 ouvre un portefeuille multi-chaînes', () => {
    expect(classifyRecoveryPhrase(art.phrase)).toBe('bip39');
  });

  /*
   * Valide dans les DEUX systèmes : c'est un portefeuille BIP-39 (ses comptes
   * EVM, Bitcoin et Solana existent), dont la clé TON suit la dérivation native —
   * comme dans Tonkeeper. Deux questions, deux réponses qui se complètent.
   */
  it('une phrase valide dans les deux reste multi-chaînes, et sa clé TON est native', () => {
    expect(classifyRecoveryPhrase(both.phrase)).toBe('bip39');
    expect(tonKeyKind(both.phrase)).toBe('ton');
  });

  it('refuse le reste', () => {
    for (const p of VECTORS.invalid) expect(classifyRecoveryPhrase(p)).toBeNull();
    expect(classifyRecoveryPhrase('')).toBeNull();
  });
});

describe('tonPublicKeyFromPhrase', () => {
  it('rend la clé publique de Tonkeeper, pour les deux sortes de phrase', () => {
    expect(hex.encode(tonPublicKeyFromPhrase(official[0].phrase))).toBe(official[0].publicKey);
    expect(hex.encode(tonPublicKeyFromPhrase(art.phrase))).toBe(art.publicKey);
  });

  it('la clé rendue correspond à celle que resolveTonKey dériverait', () => {
    const k = resolveTonKey(both.phrase);
    expect(hex.encode(tonPublicKeyFromPhrase(both.phrase))).toBe(hex.encode(k.publicKey));
  });
});

describe('graine BIP-39 fournie par l’appelant', () => {
  it('donne la même clé, et n’est PAS effacée (elle appartient à l’appelant)', () => {
    const seed = mnemonicToSeedSync(art.phrase);
    const before = hex.encode(seed);
    expect(hex.encode(tonPublicKeyFromPhrase(art.phrase, seed))).toBe(art.publicKey);
    expect(hex.encode(seed)).toBe(before);
  });
});

