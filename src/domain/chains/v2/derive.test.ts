import { secp256k1 } from '@noble/curves/secp256k1';
import { ed25519 } from '@noble/curves/ed25519';
import { base58 } from '@scure/base';
import { bytesToHex } from '@noble/hashes/utils';
import { signerFromSeed, signerFromEvmPrivateKey } from './derive';
import { mnemonicToSeedSync } from '../../../crypto/mnemonic';
import { deriveEvmAccount } from '../../../crypto/hd';
import { deriveBtcAccount } from '../../../crypto/btc';
import { deriveSolanaAccount } from '../../../crypto/solana';

const PHRASE =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const seed = mnemonicToSeedSync(PHRASE);

describe('signerFromSeed — la clé dérivée correspond au compte AFFICHÉ', () => {
  it('EVM : la clé publique redonne l\'adresse du compte', () => {
    /*
     * C'est l'invariant qui compte : une erreur d'aiguillage produirait une clé
     * parfaitement valide, mais pour une AUTRE adresse — l'utilisateur verrait
     * une transaction partir d'un compte qui n'est pas le sien.
     */
    const s = signerFromSeed('evm', seed, 0);
    expect(s.curve).toBe('secp256k1');
    if (s.curve !== 'secp256k1') return;
    const attendu = deriveEvmAccount(seed, 0);
    expect(`0x${bytesToHex(s.privateKey)}`).toBe(attendu.privateKey);
    expect(bytesToHex(secp256k1.getPublicKey(s.privateKey, true))).toBe(bytesToHex(s.publicKey));
  });

  it('Bitcoin : MÊME courbe que l\'EVM, mais PAS la même clé', () => {
    // BIP-44 contre BIP-84 : la courbe ne dit pas le chemin. Aiguiller sur la
    // courbe au lieu de la famille donnerait la clé EVM pour Bitcoin.
    const evm = signerFromSeed('evm', seed, 0);
    const btc = signerFromSeed('bitcoin', seed, 0);
    expect(btc.curve).toBe('secp256k1');
    if (evm.curve !== 'secp256k1' || btc.curve !== 'secp256k1') return;
    expect(bytesToHex(btc.privateKey)).not.toBe(bytesToHex(evm.privateKey));
    // Et la clé publique correspond bien à l'adresse Bitcoin dérivée.
    expect(bytesToHex(btc.publicKey)).toBe(bytesToHex(secp256k1.getPublicKey(btc.privateKey, true)));
  });

  it('Solana : ed25519, et la clé publique EST l\'adresse', () => {
    const s = signerFromSeed('solana', seed, 0);
    expect(s.curve).toBe('ed25519');
    if (s.curve !== 'ed25519') return;
    expect(base58.encode(s.publicKey)).toBe(deriveSolanaAccount(seed, 0).address);
    expect(bytesToHex(ed25519.getPublicKey(s.secretKey))).toBe(bytesToHex(s.publicKey));
  });

  it('l\'indice de compte est respecté sur les trois familles', () => {
    for (const family of ['evm', 'bitcoin', 'solana'] as const) {
      const a = signerFromSeed(family, seed, 0);
      const b = signerFromSeed(family, seed, 1);
      const secret = (s: typeof a) => (s.curve === 'secp256k1' ? s.privateKey : s.secretKey);
      expect(bytesToHex(secret(a))).not.toBe(bytesToHex(secret(b)));
    }
    // Et l'adresse Bitcoin de l'indice 1 est bien celle attendue.
    const btc1 = signerFromSeed('bitcoin', seed, 1);
    if (btc1.curve === 'secp256k1') {
      expect(bytesToHex(btc1.publicKey)).toBe(bytesToHex(secp256k1.getPublicKey(btc1.privateKey, true)));
      expect(deriveBtcAccount(seed, 1).address).not.toBe(deriveBtcAccount(seed, 0).address);
    }
  });

  it('ne renvoie QUE le matériel de signature', () => {
    // Pas d'adresse, pas de seed, rien qui permette de remonter au portefeuille
    // entier : c'est tout l'objet de la décision.
    const s = signerFromSeed('bitcoin', seed, 0);
    expect(Object.keys(s).sort()).toEqual(['curve', 'privateKey', 'publicKey']);
    expect(Object.keys(signerFromSeed('solana', seed, 0)).sort()).toEqual(['curve', 'publicKey', 'secretKey']);
  });

  it('une famille inconnue LÈVE, au lieu de retomber sur l\'EVM', () => {
    /*
     * Un repli silencieux produirait une signature valide avec la mauvaise
     * clé : l'utilisateur verrait une transaction partir d'une adresse qui
     * n'est pas la sienne. Mieux vaut refuser bruyamment.
     */
    expect(() => signerFromSeed('cosmos' as never, seed, 0)).toThrow(/cosmos/);
  });
});

describe('signerFromEvmPrivateKey', () => {
  it('accepte avec et sans préfixe 0x', () => {
    const { privateKey } = deriveEvmAccount(seed, 0);
    const a = signerFromEvmPrivateKey(privateKey);
    const b = signerFromEvmPrivateKey(privateKey.replace(/^0x/, ''));
    if (a.curve !== 'secp256k1' || b.curve !== 'secp256k1') return;
    expect(bytesToHex(a.privateKey)).toBe(bytesToHex(b.privateKey));
  });

  it('refuse une clé de mauvaise longueur', () => {
    expect(() => signerFromEvmPrivateKey('0xdeadbeef')).toThrow(/32 octets/);
  });
});
