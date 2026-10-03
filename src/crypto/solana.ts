/**
 * Dérivation Solana (ed25519, SLIP-0010).
 *
 * Solana n'utilise PAS secp256k1 : les clés sont sur la courbe ed25519 et la
 * dérivation suit SLIP-0010 (uniquement des index DURCIS). @scure/bip32 ne
 * convient donc pas — on implémente SLIP-0010 avec HMAC-SHA512 (@noble/hashes)
 * et on obtient la clé publique via @noble/curves/ed25519. L'adresse Solana EST
 * la clé publique (32 octets) encodée en base58.
 *
 * Chemin standard (compatible Phantom) : m/44'/501'/index'/0'. Une seule seed
 * BIP-39 dérive donc EVM, BTC ET Solana, sur des chemins disjoints.
 */
import { bytesToHex } from '@noble/hashes/utils';
import { ed25519 } from '@noble/curves/ed25519';
import { base58 } from '@scure/base';
import { deriveEd25519 } from './slip10';

/** Chemin Solana : m/44'/501'/account'/0' (tous durcis). */
export function solPath(index = 0): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error('solPath: index doit être un entier >= 0');
  }
  return `m/44'/501'/${index}'/0'`;
}

export interface SolAccount {
  index: number;
  path: string;
  /** Adresse Solana (clé publique base58). */
  address: string;
  publicKey: string; // 0x-hex (32 octets)
}

/** Dérive le compte Solana #index à partir d'une seed BIP-39. */
export function deriveSolanaAccount(seed: Uint8Array, index = 0): SolAccount {
  const path = solPath(index);
  const { key } = deriveEd25519(seed, [44, 501, index, 0]);
  const pub = ed25519.getPublicKey(key);
  return {
    index,
    path,
    address: base58.encode(pub),
    publicKey: '0x' + bytesToHex(pub),
  };
}

export interface SolSigner {
  /** Clé privée ed25519 (graine 32 octets) — transite pour signer, jamais stockée. */
  secretKey: Uint8Array;
  /** Clé publique (32 octets). */
  publicKey: Uint8Array;
  address: string;
}

/** Dérive la clé de SIGNATURE Solana #index (pour l'envoi). */
export function deriveSolanaSigner(seed: Uint8Array, index = 0): SolSigner {
  const { key } = deriveEd25519(seed, [44, 501, index, 0]);
  const publicKey = ed25519.getPublicKey(key);
  return { secretKey: key, publicKey, address: base58.encode(publicKey) };
}

/** Valide une adresse Solana (base58, 32 octets sur la courbe). */
export function isValidSolanaAddress(addr: string): boolean {
  try {
    const bytes = base58.decode(addr);
    return bytes.length === 32;
  } catch {
    return false;
  }
}

/**
 * L'adresse est-elle celle d'un PORTEFEUILLE, ou d'un compte dérivé de programme ?
 *
 * Sur Solana, une adresse de 32 octets valide peut être deux choses très
 * différentes : une clé publique ed25519, donc un portefeuille que quelqu'un
 * contrôle ; ou une PDA — compte de jeton associé, compte de programme — que
 * PERSONNE ne peut signer. Envoyer du SOL sur une PDA, c'est le perdre
 * définitivement, et c'est une erreur courante : l'adresse d'un compte de jeton
 * USDC se copie aussi facilement que celle d'un portefeuille.
 *
 * Rien ne distinguait les deux : toute chaîne de 32 octets était acceptée sans
 * un mot. On vérifie donc si l'adresse est un point valide de la courbe —
 * seules les vraies clés publiques le sont.
 */
export function isWalletAddress(addr: string): boolean {
  try {
    const bytes = base58.decode(addr);
    if (bytes.length !== 32) return false;
    ed25519.Point.fromHex(bytes);
    return true;
  } catch {
    return false;
  }
}
