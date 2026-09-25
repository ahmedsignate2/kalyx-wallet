/**
 * Dérivation du signataire, par famille de chaîne.
 *
 * C'est l'aiguillage que la décision « la seed ne quitte pas le store » rend
 * nécessaire. Il est ici, pur et testé, plutôt que dans `walletStore` : le store
 * reste responsable de DÉTENIR le secret, ce module de savoir quoi en dériver.
 * Une chaîne ajoutée, c'est une branche ici — une dizaine de lignes — et rien
 * d'autre à toucher.
 *
 * EVM et Bitcoin partagent la courbe secp256k1 mais PAS le chemin de
 * dérivation : BIP-44 pour l'un, BIP-84 pour l'autre. L'aiguillage se fait donc
 * sur la famille, pas sur la courbe — se tromper produirait une clé valide pour
 * une adresse qui n'est pas celle du compte affiché.
 */
import { secp256k1 } from '@noble/curves/secp256k1';
import { hexToBytes } from '@noble/hashes/utils';
import { deriveEvmAccount } from '../../../crypto/hd';
import { deriveBtcSigner } from '../../../crypto/btc';
import { deriveSolanaSigner } from '../../../crypto/solana';
import type { ChainFamily } from '../types';
import type { ChainSigner } from './signer';

/** Octets d'une clé privée EVM, quelle que soit la présence du préfixe `0x`. */
function evmKeyBytes(hex: string): Uint8Array {
  return hexToBytes(hex.replace(/^0x/, ''));
}

/** Signataire secp256k1 à partir d'une clé privée EVM hexadécimale. */
export function signerFromEvmPrivateKey(privateKeyHex: string): ChainSigner {
  const privateKey = evmKeyBytes(privateKeyHex);
  if (privateKey.length !== 32) throw new Error('Clé privée EVM invalide (32 octets attendus)');
  return { curve: 'secp256k1', privateKey, publicKey: secp256k1.getPublicKey(privateKey, true) };
}

/**
 * Dérive le signataire attendu par une famille de chaîne.
 *
 * Ne renvoie QUE le matériel de signature : ni adresse, ni seed, ni rien qui
 * permette de dériver autre chose. C'est tout l'objet de la décision — un
 * adapter ne doit pas pouvoir remonter du signataire qu'on lui donne au
 * portefeuille entier.
 */
export function signerFromSeed(family: ChainFamily, seed: Uint8Array, index = 0): ChainSigner {
  switch (family) {
    case 'evm':
      return signerFromEvmPrivateKey(deriveEvmAccount(seed, index).privateKey);
    case 'bitcoin': {
      const s = deriveBtcSigner(seed, index);
      return { curve: 'secp256k1', privateKey: s.privateKey, publicKey: s.publicKey };
    }
    case 'solana': {
      const s = deriveSolanaSigner(seed, index);
      return { curve: 'ed25519', secretKey: s.secretKey, publicKey: s.publicKey };
    }
    default:
      /*
       * Explicite, et pas un repli silencieux. Une famille inconnue qui
       * retomberait sur l'EVM par défaut produirait une signature valide avec
       * la mauvaise clé : l'utilisateur verrait une transaction partir d'une
       * adresse qui n'est pas la sienne.
       */
      throw new Error(`Aucune dérivation de signataire pour la famille « ${family} »`);
  }
}
