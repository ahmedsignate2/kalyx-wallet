import {
  generateMnemonic,
  validateMnemonic,
  mnemonicToSeedSync,
  entropyToMnemonic,
} from './mnemonic';
import { Mnemonic } from 'ethers';

// Vecteur de référence BIP-39 (test vectors Trezor) : entropie 16 octets à 0.
const ZERO_ENTROPY_16 = new Uint8Array(16);
const ABANDON_ABOUT =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('mnemonic BIP-39', () => {
  it('entropie nulle (16 octets) -> phrase de référence connue', () => {
    expect(entropyToMnemonic(ZERO_ENTROPY_16)).toBe(ABANDON_ABOUT);
  });

  it('valide une phrase correcte et rejette une phrase corrompue', () => {
    expect(validateMnemonic(ABANDON_ABOUT)).toBe(true);
    // Dernier mot faux -> checksum invalide.
    expect(validateMnemonic(ABANDON_ABOUT.replace(/about$/, 'zoo'))).toBe(false);
    expect(validateMnemonic('ceci nest pas une phrase bip39')).toBe(false);
  });

  it('normalise la saisie (espaces / casse) sans casser la validation', () => {
    expect(validateMnemonic(`  ${ABANDON_ABOUT.toUpperCase()}   `)).toBe(true);
  });

  it('génère 12 mots (128 bits) valides', () => {
    const m = generateMnemonic(128);
    expect(m.split(' ')).toHaveLength(12);
    expect(validateMnemonic(m)).toBe(true);
  });

  it('génère 24 mots (256 bits) valides et différents à chaque appel', () => {
    const a = generateMnemonic(256);
    const b = generateMnemonic(256);
    expect(a.split(' ')).toHaveLength(24);
    expect(validateMnemonic(a)).toBe(true);
    expect(a).not.toBe(b); // aléatoire réel
  });

  it('la seed dérivée correspond à celle calculée indépendamment par ethers', () => {
    const seed = mnemonicToSeedSync(ABANDON_ABOUT);
    const seedHex = '0x' + Buffer.from(seed).toString('hex');
    expect(seedHex).toBe(Mnemonic.fromPhrase(ABANDON_ABOUT).computeSeed());
  });

  it('une passphrase change la seed (feature BIP-39)', () => {
    const s1 = mnemonicToSeedSync(ABANDON_ABOUT);
    const s2 = mnemonicToSeedSync(ABANDON_ABOUT, 'TREZOR');
    expect(Buffer.from(s1).equals(Buffer.from(s2))).toBe(false);
  });
});
