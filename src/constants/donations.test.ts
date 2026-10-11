import { DONATIONS, DONATION_BTC, DONATION_EVM, DONATION_SOL, DONATION_TON, DONATION_EVM_CHAINS, sameTonAccount } from './donations';
import { isValidBtcAddress } from '../domain/validation/btcAddress';
import { isValidEvmAddress } from '../domain/validation/address';
import { isValidSolanaAddress } from '../crypto/solana';
import { isValidTonAddress, parseTonAddress, toRawTonAddress, formatTonAddress } from '../domain/chains/ton/tonAddress';
import { hasChain, getAdapter } from '../domain/chains/registry';

describe('Adresses de don', () => {
  it('chaque adresse est valide pour sa famille (validateurs du projet)', () => {
    expect(isValidBtcAddress(DONATION_BTC)).toBe(true);
    expect(isValidEvmAddress(DONATION_EVM)).toBe(true);
    expect(isValidSolanaAddress(DONATION_SOL)).toBe(true);
    expect(isValidTonAddress(DONATION_TON)).toBe(true);
  });
  it("l'adresse BTC confirmée est celle de l'app (plus l'ancienne du README)", () => {
    expect(DONATION_BTC).toBe('bc1qkalyxyueng23j7elpqrk4pcp3thp94u6cs5rkn');
    expect(DONATIONS.some((d) => d.address.startsWith('bc1qwdqes'))).toBe(false);
  });
  it('TON : réseau principal, forme non rebondissante', () => {
    const p = parseTonAddress(DONATION_TON)!;
    expect(p.testnet).toBe(false);
    expect(p.bounceable).toBe(false);
  });
  it('chaque réseau proposé existe et appartient à la bonne famille', () => {
    for (const d of DONATIONS) {
      for (const c of d.chains) {
        expect(hasChain(c)).toBe(true);
        expect(getAdapter(c).config.family).toBe(d.family);
      }
    }
    expect(DONATION_EVM_CHAINS[0]).toBe('base'); // frais bas d'abord
    expect(DONATION_EVM_CHAINS).toContain('ethereum');
  });
  it('sameTonAccount : UQ, EQ et forme brute désignent le même compte', () => {
    const p = parseTonAddress(DONATION_TON)!;
    expect(sameTonAccount(DONATION_TON, toRawTonAddress(p))).toBe(true);
    expect(sameTonAccount(DONATION_TON, formatTonAddress(p, { bounceable: true }))).toBe(true);
    const other = formatTonAddress({ workchain: 0, hash: new Uint8Array(32).fill(7) }, { bounceable: false });
    expect(sameTonAccount(DONATION_TON, other)).toBe(false);
    expect(sameTonAccount('', DONATION_TON)).toBe(false);
  });
});
