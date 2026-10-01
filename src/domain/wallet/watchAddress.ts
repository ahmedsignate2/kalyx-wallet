/**
 * PORTEFEUILLE EN LECTURE SEULE — reconnaître l'adresse qu'on veut suivre.
 *
 * Aucune clé : l'app affiche soldes, historique et jetons d'une adresse, sans
 * jamais pouvoir signer. La famille se DÉDUIT de l'adresse, sans ambiguïté :
 *  - EVM : 0x + 40 hexadécimaux (checksum EIP-55 vérifié s'il y a des majuscules) ;
 *  - Bitcoin : bc1… / 1… / 3… avec checksum (réseau principal) ;
 *  - Solana : base58 décodant 32 octets — une adresse Bitcoin base58 en décode 25,
 *    les deux ne se recouvrent donc pas.
 * TON n'est PAS proposé : le portefeuille range une clé publique TON, pas une
 * adresse, et une adresse ne permet pas de retrouver la clé.
 */
import { checkEvmAddress } from '../validation/address';
import { isValidBtcAddress, normalizeBtcAddress } from '../validation/btcAddress';
import { isValidSolanaAddress } from '../../crypto/solana';
import { isValidTonAddress } from '../chains/ton/tonAddress';

export type WatchFamily = 'evm' | 'bitcoin' | 'solana';
export type WatchAddressError = 'EMPTY' | 'BAD_CHECKSUM' | 'TON_UNSUPPORTED' | 'UNKNOWN';

export function parseWatchAddress(input: string): { ok: true; family: WatchFamily; address: string } | { ok: false; error: WatchAddressError } {
  const a = (input ?? '').trim();
  if (!a) return { ok: false, error: 'EMPTY' };
  if (/^0x/i.test(a)) {
    const r = checkEvmAddress(a);
    if (r.valid && r.checksummed) return { ok: true, family: 'evm', address: r.checksummed };
    return { ok: false, error: /^0x[0-9a-fA-F]{40}$/.test(a) ? 'BAD_CHECKSUM' : 'UNKNOWN' };
  }
  if (isValidBtcAddress(a)) return { ok: true, family: 'bitcoin', address: normalizeBtcAddress(a) };
  if (isValidSolanaAddress(a)) return { ok: true, family: 'solana', address: a };
  if (isValidTonAddress(a) || isValidTonAddress(a, { testnet: true })) return { ok: false, error: 'TON_UNSUPPORTED' };
  return { ok: false, error: 'UNKNOWN' };
}
