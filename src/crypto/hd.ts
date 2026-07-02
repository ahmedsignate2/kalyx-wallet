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
