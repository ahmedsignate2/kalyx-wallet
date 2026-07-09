/**
 * Dérivation HD (BIP-32 / BIP-44) pour les comptes EVM.
 *
 * ETH, BNB Chain et Polygon partagent la même dérivation (coin type 60) :
 * une seule clé => la même adresse 0x... sur les trois. Seul le RPC change.
 *
 * La clé privée en clair ne doit exister que le temps d'une signature, puis
 * être remise à zéro par l'appelant. Elle ne transite jamais sur le réseau.
 */
import { HDKey } from '@scure/bip32';
import { bytesToHex } from '@noble/hashes/utils';
import { computeAddress, SigningKey } from 'ethers';

/**
 * Normalise une clé privée EVM saisie : accepte avec ou sans `0x`, espaces autour,
 * majuscules/minuscules. Renvoie une clé `0x`-hex de 64 caractères, ou lève si
 * l'entrée n'est pas une clé secp256k1 valide (mauvaise longueur / hors intervalle).
 */
export function normalizeEvmPrivateKey(input: string): string {
  const raw = input.trim().replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error('Clé privée invalide : 64 caractères hexadécimaux attendus (avec ou sans 0x).');
  }
  // SigningKey valide l'intervalle secp256k1 (rejette 0 et >= n).
  const key = '0x' + raw.toLowerCase();
  new SigningKey(key); // lève si hors intervalle
  return key;
}

/** Construit un compte EVM (index 0, sans chemin HD) depuis une clé privée brute. */
export function evmAccountFromPrivateKey(input: string): EvmAccount {
  const privateKey = normalizeEvmPrivateKey(input);
  const publicKey = new SigningKey(privateKey).compressedPublicKey;
  const address = computeAddress(SigningKey.computePublicKey(privateKey, false));
  return { index: 0, path: '', privateKey, publicKey, address };
}

export interface EvmAccount {
  index: number;
  /** Chemin de dérivation BIP-44 utilisé. */
  path: string;
  /** Clé privée 0x-hex. Sensible : ne jamais logger ni transmettre. */
  privateKey: string;
  /** Clé publique compressée 0x-hex. */
  publicKey: string;
  /** Adresse EVM au format EIP-55 (checksum). */
  address: string;
}

/** Chemin BIP-44 standard EVM : m/44'/60'/0'/0/index. */
export function evmPath(index = 0): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error('evmPath: index doit être un entier >= 0');
  }
  return `m/44'/60'/0'/0/${index}`;
}

/** Dérive le compte EVM #index à partir d'une seed BIP-39. */
export function deriveEvmAccount(seed: Uint8Array, index = 0): EvmAccount {
  const path = evmPath(index);
  const node = HDKey.fromMasterSeed(seed).derive(path);

  if (!node.privateKey || !node.publicKey) {
    throw new Error('Dérivation impossible : clé absente sur le nœud dérivé');
  }

  const privateKey = '0x' + bytesToHex(node.privateKey);
  const publicKey = '0x' + bytesToHex(node.publicKey);
  // Adresse dérivée de la clé publique non compressée (keccak256 + EIP-55).
  const address = computeAddress(SigningKey.computePublicKey(privateKey, false));

  return { index, path, privateKey, publicKey, address };
}
