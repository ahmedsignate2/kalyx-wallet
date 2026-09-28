import { formatExportedKey } from './exportKey';
import { parseImportedKey } from './importKey';
import { mnemonicToSeedSync } from '../../crypto/mnemonic';
import { deriveBtcSigner } from '../../crypto/btc';
import { deriveSolanaSigner } from '../../crypto/solana';
import { deriveEvmAccount } from '../../crypto/hd';

const seed = mnemonicToSeedSync('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');

describe('Export de clé : le format de CETTE famille, réimportable tel quel', () => {
  it('Bitcoin → WIF compressé, qui se réimporte en la même clé', () => {
    const s = deriveBtcSigner(seed, 0);
    const wif = formatExportedKey('bitcoin', s.privateKey);
    expect(wif).toMatch(/^[KL]/); // WIF compressé du réseau principal
    const back = parseImportedKey(wif);
    expect(back.ok && Buffer.from(back.key.secret).equals(Buffer.from(s.privateKey))).toBe(true);
    expect(back.ok && back.key.compressed).toBe(true);
  });

  it('Solana → base58 de 64 octets (Phantom), qui se réimporte en la même clé', () => {
    const s = deriveSolanaSigner(seed, 0);
    const k = formatExportedKey('solana', s.secretKey, s.publicKey);
    const back = parseImportedKey(k);
    expect(back.ok && back.key.families).toContain('solana');
    expect(back.ok && Buffer.from(back.key.secret).equals(Buffer.from(s.secretKey))).toBe(true);
  });

  it('EVM → 0x + 64 hex', () => {
    const a = deriveEvmAccount(seed, 0);
    expect(formatExportedKey('evm', Buffer.from(a.privateKey.slice(2), 'hex'))).toBe(a.privateKey.toLowerCase());
  });
});
