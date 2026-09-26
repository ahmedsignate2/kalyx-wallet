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
import { ed25519 } from '@noble/curves/ed25519';
import { base58 } from '@scure/base';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { deriveEvmAccount, evmAccountFromPrivateKey } from '../../../crypto/hd';
import { deriveBtcSigner, p2wpkhAddress } from '../../../crypto/btc';
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

/**
 * Signataire d'une clé IMPORTÉE : le secret est la clé, sans dérivation.
 *
 * Distinct de `signerFromSeed`, et ça n'est pas un détail. Une clé importée n'a
 * pas de chemin : appliquer BIP-44 ou BIP-84 à un secret qui EST déjà la clé
 * produirait une autre clé, donc une autre adresse — l'utilisateur verrait un
 * portefeuille vide et croirait ses fonds perdus.
 */
export function signerFromRawKey(family: ChainFamily, secret: Uint8Array): ChainSigner {
  if (secret.length !== 32) throw new Error('Clé importée invalide (32 octets attendus)');
  switch (family) {
    case 'evm':
    case 'bitcoin':
      /*
       * Clé publique COMPRESSÉE dans les deux cas. L'EVM calcule son adresse
       * depuis la forme non compressée mais n'a pas besoin qu'on la stocke, et
       * Bitcoin n'accepte que la forme compressée en segwit natif.
       */
      return { curve: 'secp256k1', privateKey: secret, publicKey: secp256k1.getPublicKey(secret, true) };
    case 'solana':
      return { curve: 'ed25519', secretKey: secret, publicKey: ed25519.getPublicKey(secret) };
    default:
      throw new Error(`Aucun signataire importable pour la famille « ${family} »`);
  }
}

/**
 * Adresse d'une clé importée, pour l'afficher AVANT de confirmer l'import.
 *
 * C'est le seul garde-fou qui vaille : une clé peut être valide et produire une
 * adresse que l'utilisateur ne reconnaît pas — un WIF non compressé, un secret
 * pris pour la mauvaise famille, une graine confondue avec une clé complète.
 * Montrer l'adresse laisse la vérification à celui qui sait.
 */
export function addressFromRawKey(family: ChainFamily, secret: Uint8Array): string {
  const signer = signerFromRawKey(family, secret);
  switch (family) {
    case 'evm':
      return evmAccountFromPrivateKey(bytesToHex(secret)).address;
    case 'bitcoin':
      return p2wpkhAddress(signer.publicKey);
    case 'solana':
      return base58.encode(signer.publicKey);
    default:
      throw new Error(`Aucune adresse dérivable pour la famille « ${family} »`);
  }
}
