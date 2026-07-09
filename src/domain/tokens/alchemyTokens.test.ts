import { parseTokenBalances, parseTokenMetadata, isSpamToken, pageKeyOf } from './alchemyTokens';
import { knownTokensFor, KNOWN_ERC20_BY_CHAIN } from './knownTokens';

describe('knownTokensFor (tokens connus par chaîne)', () => {
  it('renvoie la liste du réseau, ou vide si non couvert', () => {
    expect(knownTokensFor(8453).length).toBeGreaterThan(0); // Base
    expect(knownTokensFor(1)).toContain('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'); // USDC ETH
    expect(knownTokensFor(999999)).toEqual([]);
    expect(knownTokensFor(undefined)).toEqual([]);
  });
  it('toutes les adresses sont des 0x-hex de 42 caractères', () => {
    for (const list of Object.values(KNOWN_ERC20_BY_CHAIN)) {
      for (const addr of list) expect(addr).toMatch(/^0x[0-9a-fA-F]{40}$/);
    }
  });
});

describe('pageKeyOf (pagination)', () => {
  it('extrait un pageKey présent, sinon undefined', () => {
    expect(pageKeyOf({ result: { pageKey: '0xabc' } })).toBe('0xabc');
    expect(pageKeyOf({ result: {} })).toBeUndefined();
    expect(pageKeyOf({ result: { pageKey: '' } })).toBeUndefined(); // vide = fin
    expect(pageKeyOf(null)).toBeUndefined();
    expect(pageKeyOf({})).toBeUndefined();
  });
});

describe('parseTokenBalances', () => {
  it('garde les soldes non nuls, hex -> bigint', () => {
    const json = {
      result: {
        tokenBalances: [
          { contractAddress: '0xA', tokenBalance: '0x0de0b6b3a7640000' }, // 1e18
          { contractAddress: '0xB', tokenBalance: '0x0' },
          { contractAddress: '0xC', tokenBalance: '0x1' },
        ],
      },
    };
    const out = parseTokenBalances(json);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ contract: '0xA', raw: 10n ** 18n });
    expect(out[1]).toEqual({ contract: '0xC', raw: 1n });
  });
  it('robuste sur entrée invalide', () => {
    expect(parseTokenBalances(null)).toEqual([]);
    expect(parseTokenBalances({ result: {} })).toEqual([]);
    expect(parseTokenBalances({ result: { tokenBalances: [{ contractAddress: '0xX', tokenBalance: 'zzz' }] } })).toEqual([]);
  });
});

describe('parseTokenMetadata', () => {
  it('extrait name/symbol/decimals/logo', () => {
    expect(parseTokenMetadata({ result: { name: 'USD Coin', symbol: 'USDC', decimals: 6, logo: 'http://l' } })).toEqual({
      name: 'USD Coin',
      symbol: 'USDC',
      decimals: 6,
      logo: 'http://l',
    });
  });
  it('null si pas de result', () => {
    expect(parseTokenMetadata({})).toBeNull();
  });
});

describe('isSpamToken', () => {
  it('accepte les tokens légitimes', () => {
    expect(isSpamToken({ name: 'USD Coin', symbol: 'USDC', decimals: 6 })).toBe(false);
    expect(isSpamToken({ name: 'Pepe', symbol: 'PEPE', decimals: 18 })).toBe(false);
    expect(isSpamToken({ name: 'Tether USD', symbol: 'USDT', decimals: 6 })).toBe(false);
  });
  it('rejette les arnaques classiques', () => {
    expect(isSpamToken({ name: 'Visit claim-rewards.com', symbol: 'CLAIM', decimals: 18 })).toBe(true);
    expect(isSpamToken({ name: 'Airdrop', symbol: 'reward.io', decimals: 18 })).toBe(true);
    expect(isSpamToken({ name: '', symbol: '', decimals: 18 })).toBe(true);
    expect(isSpamToken({ name: 'X', symbol: 'SUPERLONGSYMBOL123', decimals: 18 })).toBe(true);
    expect(isSpamToken({ name: 'X', symbol: 'X', decimals: 999 })).toBe(true);
  });
});
