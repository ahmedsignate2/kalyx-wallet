jest.mock('../src', () => {
  const actual = jest.requireActual('../src');
  return { ...actual, getAdapter: jest.fn(), getAdapterV2: jest.fn() };
});
import { getAdapter, getAdapterV2 } from '../src';
import { availableFrom, freshRaw, needsRead, readSwapBalance, swapBalanceKey, BALANCE_TTL_MS } from './swapBalance';
import { EvmChainAdapter, SolanaChainAdapter } from '../src';

describe('readSwapBalance', () => {
  it('lève quand la lecture échoue (jamais un 0 inventé)', async () => {
    (getAdapter as jest.Mock).mockReturnValue({ getBalance: jest.fn(async () => { throw new Error('rpc'); }) });
    await expect(readSwapBalance('ethereum', '0xme', '0x0', true)).rejects.toThrow('rpc');
  });
  it('TON : jetton absent d’une liste lue = 0 ; présent = son solde', async () => {
    (getAdapter as jest.Mock).mockReturnValue({});
    const master = '0:' + 'AB'.repeat(32);
    (getAdapterV2 as jest.Mock).mockReturnValue({ listTokens: jest.fn(async () => [{ id: master, raw: 42n }]) });
    expect(await readSwapBalance('ton', 'me', master.toLowerCase(), false)).toBe(42n);
    expect(await readSwapBalance('ton', 'me', '0:zzz', false)).toBe(0n);
  });
});

describe('availableFrom', () => {
  it('inconnu tant que le solde ou la réserve manque', () => {
    expect(availableFrom(undefined, false, 0n)).toBeNull();
    expect(availableFrom({ status: 'loading', since: 0 }, false, 0n)).toBeNull();
    expect(availableFrom({ status: 'error' }, false, 0n)).toBeNull();
    expect(availableFrom({ status: 'ok', raw: 10n, at: 0 }, true, null)).toBeNull();
  });
  it('natif : solde moins la réserve, jamais négatif', () => {
    expect(availableFrom({ status: 'ok', raw: 10n, at: 0 }, true, 3n)).toBe(7n);
    expect(availableFrom({ status: 'ok', raw: 2n, at: 0 }, true, 3n)).toBe(0n);
    expect(availableFrom({ status: 'ok', raw: 10n, at: 0 }, false, 3n)).toBe(10n);
  });
  it('clé : casse ignorée pour EVM, conservée pour un mint Solana', () => {
    const usdc = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
    expect(swapBalanceKey('base', '0xme', usdc)).toBe(swapBalanceKey('base', '0xme', usdc.toLowerCase()));
    expect(swapBalanceKey('solana', 'me', 'EPjFWdd5')).not.toBe(swapBalanceKey('solana', 'me', 'epjfwdd5'));
  });
});

describe('Solana', () => {
  it('somme les comptes du mint ; une erreur RPC remonte (pas de faux 0)', async () => {
    const sol = Object.create(SolanaChainAdapter.prototype);
    sol.rpc = jest.fn(async () => ({ value: [{ account: { data: { parsed: { info: { tokenAmount: { amount: '2000000' } } } } } }, { account: { data: { parsed: { info: { tokenAmount: { amount: '778700' } } } } } }] }));
    (getAdapter as jest.Mock).mockReturnValue(sol);
    expect(await readSwapBalance('solana', 'me', 'MINT', false)).toBe(2778700n);
    sol.rpc = jest.fn(async () => { throw new Error('429'); });
    await expect(readSwapBalance('solana', 'me', 'MINT', false)).rejects.toThrow('429');
  });
});

describe('needsRead', () => {
  it('absent, erreur ou trop vieux → relire ; frais → garder', () => {
    expect(needsRead(undefined, 0)).toBe(true);
    expect(needsRead({ status: 'error' }, 0)).toBe(true);
    expect(needsRead({ status: 'loading', since: 0 }, 10_000)).toBe(false);
    expect(needsRead({ status: 'loading', since: 0 }, 25_000)).toBe(true); // attente orpheline
    expect(needsRead({ status: 'ok', raw: 1n, at: 0 }, BALANCE_TTL_MS - 1)).toBe(false);
    expect(needsRead({ status: 'ok', raw: 1n, at: 0 }, BALANCE_TTL_MS + 1)).toBe(true);
  });
});

describe('EVM', () => {
  it('balanceOf strict : réponse vide ou illisible = erreur, jamais 0', async () => {
    const evm = Object.create(EvmChainAdapter.prototype);
    const token = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
    evm.call = jest.fn(async () => '0x' + (5n).toString(16).padStart(64, '0'));
    (getAdapter as jest.Mock).mockReturnValue(evm);
    expect(await readSwapBalance('base', '0x0000000000000000000000000000000000000001', token, false)).toBe(5n);
    evm.call = jest.fn(async () => '0x');
    await expect(readSwapBalance('base', '0x0000000000000000000000000000000000000001', token, false)).rejects.toThrow();
  });
});

describe('freshRaw', () => {
  it('rend la valeur seulement si elle est lue et fraîche', () => {
    expect(freshRaw({ status: 'ok', raw: 7n, at: 0 }, 1_000)).toBe(7n);
    expect(freshRaw({ status: 'ok', raw: 7n, at: 0 }, BALANCE_TTL_MS + 1)).toBeNull();
    expect(freshRaw({ status: 'error' }, 0)).toBeNull();
  });
});
