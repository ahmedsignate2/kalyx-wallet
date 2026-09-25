import { findProgramAddress, getAssociatedTokenAddress, isOnCurve } from './solPda';
import { deriveSolanaAccount } from './solana';
import { mnemonicToSeedSync } from './mnemonic';
import { base58 } from '@scure/base';

const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

describe('isOnCurve', () => {
  it('une clé publique dérivée est SUR la courbe', () => {
    const acc = deriveSolanaAccount(
      mnemonicToSeedSync('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'),
      0,
    );
    expect(isOnCurve(base58.decode(acc.address))).toBe(true);
  });
});

describe('getAssociatedTokenAddress', () => {
  const OWNER = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';

  it('produit une adresse base58 de 32 octets, HORS courbe (vraie PDA)', () => {
    const ata = getAssociatedTokenAddress(USDC, OWNER);
    const bytes = base58.decode(ata);
    expect(bytes.length).toBe(32);
    expect(isOnCurve(bytes)).toBe(false); // un ATA n'a pas de clé privée
  });

  it('correspond à l\'ATA attendue (régression)', () => {
    expect(getAssociatedTokenAddress(USDC, OWNER)).toBe('5N3f1tj9v1vc5TUZ8S7mCAnVmjVKrfnzXWhxLaxyZAgt');
  });

  it('déterministe et dépendant du couple (owner, mint)', () => {
    expect(getAssociatedTokenAddress(USDC, OWNER)).toBe(getAssociatedTokenAddress(USDC, OWNER));
    const other = 'GsbwXfJraMomNxBcpR3DBNxnKwAzc6dvfL3zYVXpChJ8';
    expect(getAssociatedTokenAddress(USDC, OWNER)).not.toBe(getAssociatedTokenAddress(USDC, other));
  });

  it('rejette owner/mint mal formés', () => {
    expect(() => getAssociatedTokenAddress(USDC, 'abc')).toThrow();
  });
});

describe('findProgramAddress', () => {
  it('renvoie une adresse hors-courbe avec un bump <= 255', () => {
    const { address, bump } = findProgramAddress([base58.decode(USDC)], base58.decode(USDC));
    expect(address.length).toBe(32);
    expect(bump).toBeLessThanOrEqual(255);
    expect(isOnCurve(address)).toBe(false);
  });
});

describe('getAssociatedTokenAddress — Token-2022', () => {
  const OWNER = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PQtwhpU';
  const MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const TOKEN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
  const TOKEN_2022 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

  it('le programme fait partie des seeds : deux ATA DIFFÉRENTS', () => {
    /*
     * Le programme était figé sur l'historique, donc l'ATA d'un mint Token-2022
     * était calculé faux : adresse valide, mais pointant sur un compte que
     * personne n'initialisera jamais.
     */
    const legacy = getAssociatedTokenAddress(MINT, OWNER, TOKEN);
    const t2022 = getAssociatedTokenAddress(MINT, OWNER, TOKEN_2022);
    expect(legacy).not.toBe(t2022);
  });

  it('le défaut reste le programme historique', () => {
    expect(getAssociatedTokenAddress(MINT, OWNER)).toBe(getAssociatedTokenAddress(MINT, OWNER, TOKEN));
  });

  it('refuse un programme qui n\'est pas une clé de 32 octets', () => {
    expect(() => getAssociatedTokenAddress(MINT, OWNER, 'pas-un-programme')).toThrow();
  });
});
