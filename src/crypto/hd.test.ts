import { deriveEvmAccount, evmPath, evmAccountFromPrivateKey, normalizeEvmPrivateKey } from './hd';
import { mnemonicToSeedSync } from './mnemonic';
import { HDNodeWallet, Wallet } from 'ethers';

const ABANDON_ABOUT =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

// Adresse EVM de référence archi-connue pour cette phrase à m/44'/60'/0'/0/0.
const KNOWN_ADDRESS_0 = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';

describe('dérivation HD EVM (BIP-44)', () => {
  const seed = mnemonicToSeedSync(ABANDON_ABOUT);

  it('produit le chemin BIP-44 attendu', () => {
    expect(evmPath(0)).toBe("m/44'/60'/0'/0/0");
    expect(evmPath(3)).toBe("m/44'/60'/0'/0/3");
  });

  it('dérive l’adresse de référence connue (compte 0)', () => {
    const acct = deriveEvmAccount(seed, 0);
    expect(acct.address).toBe(KNOWN_ADDRESS_0);
    expect(acct.path).toBe("m/44'/60'/0'/0/0");
    expect(acct.privateKey).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('concorde avec la dérivation indépendante d’ethers (cross-check)', () => {
    const acct = deriveEvmAccount(seed, 0);
    const ref = HDNodeWallet.fromPhrase(ABANDON_ABOUT, '', "m/44'/60'/0'/0/0");
    expect(acct.address).toBe(ref.address);
    expect(acct.privateKey).toBe(ref.privateKey);
  });

  it('des index différents donnent des comptes différents', () => {
    const a0 = deriveEvmAccount(seed, 0);
    const a1 = deriveEvmAccount(seed, 1);
    expect(a0.address).not.toBe(a1.address);
    expect(a1.address).toBe(
      HDNodeWallet.fromPhrase(ABANDON_ABOUT, '', "m/44'/60'/0'/0/1").address,
    );
  });

  it('la restauration depuis la même seed est déterministe', () => {
    expect(deriveEvmAccount(seed, 0).address).toBe(
      deriveEvmAccount(mnemonicToSeedSync(ABANDON_ABOUT), 0).address,
    );
  });
});

describe('import par clé privée EVM', () => {
  // Clé privée de référence (compte 0 de la phrase abandon…) et son adresse.
  const PK = deriveEvmAccount(mnemonicToSeedSync(ABANDON_ABOUT), 0).privateKey;

  it('dérive la même adresse que la clé privée (cross-check ethers)', () => {
    const acct = evmAccountFromPrivateKey(PK);
    expect(acct.address).toBe(KNOWN_ADDRESS_0);
    expect(acct.address).toBe(new Wallet(PK).address);
    expect(acct.index).toBe(0);
    expect(acct.path).toBe('');
  });

  it('accepte les variantes de saisie (sans 0x, espaces, MAJUSCULES)', () => {
    const bare = PK.slice(2);
    expect(evmAccountFromPrivateKey(bare).address).toBe(KNOWN_ADDRESS_0);
    expect(evmAccountFromPrivateKey('  ' + PK + '  ').address).toBe(KNOWN_ADDRESS_0);
    expect(evmAccountFromPrivateKey('0x' + bare.toUpperCase()).address).toBe(KNOWN_ADDRESS_0);
    expect(normalizeEvmPrivateKey(bare)).toBe(PK); // renvoie toujours 0x-hex minuscule
  });

  it('rejette les entrées invalides', () => {
    expect(() => evmAccountFromPrivateKey('0x1234')).toThrow(); // trop court
    expect(() => evmAccountFromPrivateKey('z'.repeat(64))).toThrow(); // non-hex
    expect(() => evmAccountFromPrivateKey('0'.repeat(64))).toThrow(); // hors intervalle (0)
    expect(() => evmAccountFromPrivateKey('f'.repeat(64))).toThrow(); // >= n
  });
});
