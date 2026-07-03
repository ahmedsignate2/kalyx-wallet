/**
 * Validation d'adresses Bitcoin SegWit (mainnet, bech32/bech32m).
 *
 * Couvre les adresses modernes : bc1q… (SegWit v0, P2WPKH/P2WSH) et bc1p…
 * (Taproot v1). Une adresse au checksum ou au format invalide est rejetée
 * (protection anti-erreur d'envoi). Les adresses legacy 1…/3… ne sont pas encore
 * gérées (l'app ne génère que du bech32 ; l'envoi BTC viendra plus tard).
 */
import { bech32, bech32m } from '@scure/base';
import { WalletError } from '../errors';

export interface BtcAddressCheck {
  valid: boolean;
  reason?: 'EMPTY' | 'INVALID';
}

export function checkBtcAddress(input: string): BtcAddressCheck {
  const addr = (input ?? '').trim();
  if (addr.length === 0) return { valid: false, reason: 'EMPTY' };

  const lower = addr.toLowerCase();
  if (!lower.startsWith('bc1')) return { valid: false, reason: 'INVALID' };

  // v0 = bech32, v1+ = bech32m. On essaie le codec adéquat.
  for (const codec of [bech32, bech32m] as const) {
    try {
      const decoded = codec.decode(lower as `bc1${string}`);
      if (decoded.prefix !== 'bc') continue;
      const version = decoded.words[0];
      const program = codec.fromWords(decoded.words.slice(1));
      const okV0 =
        codec === bech32 && version === 0 && (program.length === 20 || program.length === 32);
      const okVn =
        codec === bech32m &&
        version >= 1 &&
        version <= 16 &&
        program.length >= 2 &&
        program.length <= 40;
      if (okV0 || okVn) return { valid: true };
    } catch {
      /* mauvais codec / checksum : on tente l'autre puis on rejette */
    }
  }
  return { valid: false, reason: 'INVALID' };
}

export function isValidBtcAddress(input: string): boolean {
  return checkBtcAddress(input).valid;
}

export function assertValidBtcAddress(input: string): string {
  const addr = (input ?? '').trim();
  if (!isValidBtcAddress(addr)) {
    throw new WalletError('INVALID_ADDRESS', 'Adresse Bitcoin invalide');
  }
  return addr;
}
