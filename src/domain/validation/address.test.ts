import {
  checkEvmAddress,
  normalizeEvmAddress,
  isValidEvmAddress,
} from './address';
import { isWalletError } from '../errors';

// Adresse de référence (vecteur BIP-39 abandon…about, compte 0).
const VALID = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';

describe('validation adresse EVM', () => {
  it('accepte une adresse EIP-55 correcte et la renvoie normalisée', () => {
    const r = checkEvmAddress(VALID);
    expect(r.valid).toBe(true);
    expect(r.checksummed).toBe(VALID);
  });

  it('accepte le tout-minuscule (pas de checksum imposé) et le met en EIP-55', () => {
    const r = checkEvmAddress(VALID.toLowerCase());
    expect(r.valid).toBe(true);
    expect(r.checksummed).toBe(VALID);
  });

  it('rejette une adresse en casse mixte au checksum faux (faute de frappe)', () => {
    // On inverse la casse d'un caractère -> checksum EIP-55 invalide.
    const broken = '0x9858EfFD232B4033E47d90003D41EC34EcaEdA94';
    const r = checkEvmAddress(broken);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('BAD_CHECKSUM');
  });

  it('rejette les mauvaises formes', () => {
    expect(checkEvmAddress('').reason).toBe('EMPTY');
    expect(checkEvmAddress('0x1234').reason).toBe('BAD_FORMAT');
    expect(checkEvmAddress('9858EfFD232B4033E47d90003D41EC34EcaEda94').reason).toBe('BAD_FORMAT');
    expect(checkEvmAddress('0xZZZZEfFD232B4033E47d90003D41EC34EcaEda94').reason).toBe('BAD_FORMAT');
  });

  it('normalizeEvmAddress lève une WalletError typée si invalide', () => {
    expect(normalizeEvmAddress(` ${VALID} `)).toBe(VALID);
    try {
      normalizeEvmAddress('0x1234');
      throw new Error('aurait dû lever');
    } catch (e) {
      expect(isWalletError(e)).toBe(true);
      if (isWalletError(e)) expect(e.code).toBe('INVALID_ADDRESS');
    }
  });

  it('isValidEvmAddress : booléen simple', () => {
    expect(isValidEvmAddress(VALID)).toBe(true);
    expect(isValidEvmAddress('nope')).toBe(false);
  });
});
