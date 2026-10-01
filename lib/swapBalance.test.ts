jest.mock('../src', () => {
  const actual = jest.requireActual('../src');
  return { ...actual, getAdapter: jest.fn(), getAdapterV2: jest.fn() };
});
import { getAdapter, getAdapterV2 } from '../src';
import { availableFrom, readSwapBalance, swapBalanceKey } from './swapBalance';

describe('readSwapBalance', () => {
  it('lève quand la lecture échoue (jamais un 0 inventé)', async () => {
    (getAdapter as jest.Mock).mockReturnValue({ getBalance: jest.fn(async () => { throw new Error('rpc'); }) });
    await expect(readSwapBalance('ethereum', '0xme', '0x0', true)).rejects.toThrow('rpc');
  });
  it('TON : jetton absent d’une liste lue = 0 ; présent = son solde', async () => {
    (getAdapter as jest.Mock).mockReturnValue({});
    (getAdapterV2 as jest.Mock).mockReturnValue({ listTokens: jest.fn(async () => [{ id: '0:ABC', raw: 42n }]) });
    expect(await readSwapBalance('ton', 'me', '0:abc', false)).toBe(42n);
    expect(await readSwapBalance('ton', 'me', '0:zzz', false)).toBe(0n);
  });
});

describe('availableFrom', () => {
  it('inconnu tant que le solde ou la réserve manque', () => {
    expect(availableFrom(undefined, false, 0n)).toBeNull();
    expect(availableFrom({ status: 'loading' }, false, 0n)).toBeNull();
    expect(availableFrom({ status: 'error' }, false, 0n)).toBeNull();
    expect(availableFrom({ status: 'ok', raw: 10n }, true, null)).toBeNull();
  });
  it('natif : solde moins la réserve, jamais négatif', () => {
    expect(availableFrom({ status: 'ok', raw: 10n }, true, 3n)).toBe(7n);
    expect(availableFrom({ status: 'ok', raw: 2n }, true, 3n)).toBe(0n);
    expect(availableFrom({ status: 'ok', raw: 10n }, false, 3n)).toBe(10n);
  });
  it('clé : insensible à la casse du jeton', () => {
    expect(swapBalanceKey('base', '0xme', '0xABC')).toBe(swapBalanceKey('base', '0xme', '0xabc'));
  });
});
