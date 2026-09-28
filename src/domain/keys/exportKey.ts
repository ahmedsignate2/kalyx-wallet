/**
 * Clé privée EXPORTÉE dans le format que les autres wallets attendent pour
 * CETTE famille.
 *
 * L'export d'un portefeuille à phrase rendait toujours la clé EVM, quel que
 * soit le réseau affiché : sur Solana, l'utilisateur collait dans Phantom une
 * clé qui ouvrait un autre compte. Chaque famille a son format d'usage :
 *   - EVM     : 0x + 64 hex (MetaMask, Rabby…) ;
 *   - Bitcoin : WIF compressé (Electrum, Sparrow…) ;
 *   - Solana  : base58 des 64 octets secret ‖ public (Phantom, Solflare).
 * Vérifié par aller-retour avec `parseImportedKey` (voir le test).
 */
import { base58, createBase58check, hex } from '@scure/base';
import { sha256 } from '@noble/hashes/sha256';

const b58check = createBase58check(sha256);

export type ExportFamily = 'evm' | 'bitcoin' | 'solana';

export function formatExportedKey(family: ExportFamily, privateKey: Uint8Array, publicKey?: Uint8Array): string {
  if (privateKey.length !== 32) throw new Error('Clé privée de 32 octets attendue');
  if (family === 'evm') return `0x${hex.encode(privateKey)}`;
  if (family === 'bitcoin') {
    // 0x80 = réseau principal, 0x01 final = clé publique COMPRESSÉE (adresses bc1… de Kalyx).
    const payload = new Uint8Array(34);
    payload[0] = 0x80;
    payload.set(privateKey, 1);
    payload[33] = 0x01;
    return b58check.encode(payload);
  }
  if (!publicKey || publicKey.length !== 32) throw new Error('Clé publique Solana de 32 octets attendue');
  const full = new Uint8Array(64);
  full.set(privateKey, 0);
  full.set(publicKey, 32);
  return base58.encode(full);
}
