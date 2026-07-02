/**
 * Validation d'adresses EVM.
 *
 * Deux niveaux :
 *  - forme valide (0x + 40 hex),
 *  - checksum EIP-55 correct si l'adresse est en casse mixte.
 * Une adresse en mixte dont le checksum est faux est REJETÉE (typiquement une
 * faute de frappe) : c'est une protection contre l'envoi à la mauvaise adresse.
 */
import { getAddress } from 'ethers';
import { WalletError } from '../errors';

export interface AddressCheck {
  valid: boolean;
  /** Adresse normalisée EIP-55 si valide, sinon null. */
  checksummed: string | null;
  reason?: 'EMPTY' | 'BAD_FORMAT' | 'BAD_CHECKSUM';
}

const HEX_40 = /^0x[0-9a-fA-F]{40}$/;

/** Vérifie une adresse EVM sans lever d'exception. */
export function checkEvmAddress(input: string): AddressCheck {
  const addr = (input ?? '').trim();
  if (addr.length === 0) {
    return { valid: false, checksummed: null, reason: 'EMPTY' };
  }
  if (!HEX_40.test(addr)) {
    return { valid: false, checksummed: null, reason: 'BAD_FORMAT' };
  }
  try {
    // getAddress lève si le checksum d'une adresse en casse mixte est invalide.
    const checksummed = getAddress(addr);
    return { valid: true, checksummed };
  } catch {
    return { valid: false, checksummed: null, reason: 'BAD_CHECKSUM' };
  }
}

/** Version stricte : retourne l'adresse EIP-55 ou lève une WalletError. */
export function normalizeEvmAddress(input: string): string {
  const result = checkEvmAddress(input);
  if (!result.valid || !result.checksummed) {
    throw new WalletError('INVALID_ADDRESS', `Adresse EVM invalide (${result.reason})`);
  }
  return result.checksummed;
}

export function isValidEvmAddress(input: string): boolean {
  return checkEvmAddress(input).valid;
}
