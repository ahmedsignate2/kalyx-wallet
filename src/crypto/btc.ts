/**
 * Dérivation Bitcoin (BIP-84, SegWit natif → adresses bc1...).
 *
 * Adresse P2WPKH construite à partir de la clé publique : hash160 (ripemd160 ∘
 * sha256) puis encodage bech32 (witness v0). On s'appuie sur des libs auditées
 * et CJS-compatibles (@noble/hashes, @scure/base) — pas de dépendance ESM lourde
 * pour la simple génération d'adresse. Une seule seed BIP-39 dérive EVM ET BTC,
 * sur des chemins distincts (coin type 0 pour BTC).
 */
import { HDKey } from '@scure/bip32';
import { sha256 } from '@noble/hashes/sha256';
import { ripemd160 } from '@noble/hashes/ripemd160';
import { bytesToHex } from '@noble/hashes/utils';
import { bech32 } from '@scure/base';

export interface BtcAccount {
  index: number;
  path: string;
  /** Adresse SegWit natif (bech32, bc1...). */
  address: string;
  publicKey: string; // 0x-hex compressé
}

/** Chemin BIP-84 : m/84'/0'/account'/0/index (réception). */
export function btcPath(index = 0, account = 0): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error('btcPath: index doit être un entier >= 0');
  }
  return `m/84'/0'/${account}'/0/${index}`;
}

/** Adresse P2WPKH (bech32 v0) à partir d'une clé publique compressée. */
export function p2wpkhAddress(publicKey: Uint8Array): string {
  const hash160 = ripemd160(sha256(publicKey));
  return bech32.encode('bc', [0, ...bech32.toWords(hash160)]);
}

/** Dérive le compte Bitcoin #index à partir d'une seed BIP-39. */
export function deriveBtcAccount(seed: Uint8Array, index = 0): BtcAccount {
  const path = btcPath(index);
  const node = HDKey.fromMasterSeed(seed).derive(path);
  if (!node.publicKey) {
    throw new Error('Dérivation BTC impossible : clé publique absente');
  }
  return {
    index,
    path,
    address: p2wpkhAddress(node.publicKey),
    publicKey: '0x' + bytesToHex(node.publicKey),
  };
}
