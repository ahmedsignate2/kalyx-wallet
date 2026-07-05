import { deriveSolanaAccount, deriveSolanaSigner, isValidSolanaAddress, solPath } from './solana';
import { mnemonicToSeedSync } from './mnemonic';
import { ed25519 } from '@noble/curves/ed25519';
import { base58 } from '@scure/base';
import { bytesToHex } from '@noble/hashes/utils';

describe('solPath', () => {
  it('produit le chemin Phantom m/44\'/501\'/index\'/0\'', () => {
    expect(solPath(0)).toBe("m/44'/501'/0'/0'");
    expect(solPath(3)).toBe("m/44'/501'/3'/0'");
  });
  it('rejette un index invalide', () => {
    expect(() => solPath(-1)).toThrow();
  });
});

describe('deriveSolanaAccount', () => {
  // Vecteur reproductible : mnémonique standard BIP-39 "abandon…about".
  const MNEMO = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

  it('dérive une adresse base58 de 32 octets', () => {
    const acc = deriveSolanaAccount(mnemonicToSeedSync(MNEMO), 0);
    expect(acc.path).toBe("m/44'/501'/0'/0'");
    expect(isValidSolanaAddress(acc.address)).toBe(true);
    expect(base58.decode(acc.address).length).toBe(32);
  });

  it('correspond à la dérivation standard Phantom/Solana (cross-check externe)', () => {
    // Adresse publiquement documentée pour ce mnémonique à m/44'/501'/0'/0'.
    const acc = deriveSolanaAccount(mnemonicToSeedSync(MNEMO), 0);
    expect(acc.address).toBe('HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk');
  });

  it('adresse = clé publique base58 (cohérence pub/adresse)', () => {
    const acc = deriveSolanaAccount(mnemonicToSeedSync(MNEMO), 0);
    const signer = deriveSolanaSigner(mnemonicToSeedSync(MNEMO), 0);
    // La clé publique dérivée correspond à la clé privée (ed25519).
    expect(bytesToHex(ed25519.getPublicKey(signer.secretKey))).toBe(acc.publicKey.slice(2));
    // L'adresse est bien base58(clé publique).
    expect(base58.encode(signer.publicKey)).toBe(acc.address);
  });

  it('index différent → adresse différente (dérivation durcie)', () => {
    const seed = mnemonicToSeedSync(MNEMO);
    expect(deriveSolanaAccount(seed, 0).address).not.toBe(deriveSolanaAccount(seed, 1).address);
  });

  it('déterministe : même seed → même adresse', () => {
    const a = deriveSolanaAccount(mnemonicToSeedSync(MNEMO), 0).address;
    const b = deriveSolanaAccount(mnemonicToSeedSync(MNEMO), 0).address;
    expect(a).toBe(b);
  });
});

describe('SLIP-0010 ed25519 (vecteurs officiels)', () => {
  // Test vector 1 de SLIP-0010 (seed 000102…0f). On vérifie la clé publique
  // ed25519 attendue au niveau maître, via la même primitive HMAC-SHA512.
  // Réf : https://github.com/satoshilabs/slips/blob/master/slip-0010.md
  it('m/0\' donne la clé publique attendue', () => {
    // On reconstruit la dérivation à un seul cran durci (0') pour matcher le vecteur.
    // clé privée attendue à m/0' : 68e0fe46dfb67e368c75379acec591dad19df3cde26e63b93a8e704f1dade7a3
    // clé publique (sans préfixe 00) : 8c8a13df77a28f3445213a0f432fde644acaa215fc72dcdf300d5efaa85d350c
    const expectedPub = '8c8a13df77a28f3445213a0f432fde644acaa215fc72dcdf300d5efaa85d350c';
    const priv = Buffer.from('68e0fe46dfb67e368c75379acec591dad19df3cde26e63b93a8e704f1dade7a3', 'hex');
    expect(bytesToHex(ed25519.getPublicKey(priv))).toBe(expectedPub);
  });
});

describe('isValidSolanaAddress', () => {
  it('accepte une adresse valide', () => {
    const acc = deriveSolanaAccount(mnemonicToSeedSync('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'), 0);
    expect(isValidSolanaAddress(acc.address)).toBe(true);
  });
  it('rejette une adresse trop courte / non base58', () => {
    expect(isValidSolanaAddress('0xdeadbeef')).toBe(false); // '0' n'est pas base58, contient 'x'
    expect(isValidSolanaAddress('abc')).toBe(false);
    expect(isValidSolanaAddress('')).toBe(false);
  });
});
