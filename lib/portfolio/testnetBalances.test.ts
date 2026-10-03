/**
 * Soldes des réseaux de test : lus à part, jamais dans le total, jamais ceux
 * d'un autre compte, et un réseau muet garde sa dernière valeur.
 */
const balances: Record<string, bigint | Error> = {};
jest.mock('../../src', () => {
  const actual = jest.requireActual('../../src');
  return {
    ...actual,
    getAdapter: (id: string) => ({
      getBalance: async () => {
        const v = balances[id];
        if (v instanceof Error) throw v;
        return { raw: v ?? 0n };
      },
    }),
  };
});

import { useTestnetBalances, testnetHoldings, testnetChains } from './testnetBalances';

const EVM = '0x1111111111111111111111111111111111111111';
const SOL = 'So1anaAddre55So1anaAddre55So1anaAddre55So1a';
const acct = { evmAddress: EVM, solAddress: SOL };

beforeEach(() => {
  for (const k of Object.keys(balances)) delete balances[k];
  useTestnetBalances.setState({ key: null, balances: [], loading: false, failed: [], at: 0 });
});

describe('réseaux de test', () => {
  it('ne lit que les réseaux de test pour lesquels le compte a une adresse', () => {
    const ids = testnetChains(acct).map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(['sepolia', 'base-sepolia', 'solana-devnet']));
    expect(ids).not.toContain('ethereum');
    expect(ids).not.toContain('ton-testnet'); // pas de clé TON
    expect(testnetChains({ evmAddress: EVM }).map((c) => c.id)).not.toContain('solana-devnet');
  });

  it('liste les soldes non nuls, sans valeur', async () => {
    balances.sepolia = 5n * 10n ** 17n;
    balances['solana-devnet'] = 2_000_000_000n;
    await useTestnetBalances.getState().refresh(acct, { force: true });
    const s = useTestnetBalances.getState();
    expect(s.balances.map((b) => b.chain.id).sort()).toEqual(['sepolia', 'solana-devnet']);
    expect(s.balances.find((b) => b.chain.id === 'sepolia')!.amount).toBe(0.5);
    const h = testnetHoldings(s.balances);
    expect(h.every((x) => x.price === 0 && x.fiat === 0 && x.kind === 'native')).toBe(true);
  });

  it('un réseau muet garde sa dernière valeur et est signalé', async () => {
    balances.sepolia = 10n ** 18n;
    await useTestnetBalances.getState().refresh(acct, { force: true });
    balances.sepolia = new Error('rpc down');
    await useTestnetBalances.getState().refresh(acct, { force: true });
    const s = useTestnetBalances.getState();
    expect(s.balances.find((b) => b.chain.id === 'sepolia')?.raw).toBe(10n ** 18n);
    expect(s.failed).toContain('sepolia');
  });

  it("un autre compte ne voit jamais les soldes du précédent", async () => {
    balances.sepolia = 10n ** 18n;
    await useTestnetBalances.getState().refresh(acct, { force: true });
    balances.sepolia = new Error('rpc down');
    await useTestnetBalances.getState().refresh({ evmAddress: '0x2222222222222222222222222222222222222222' }, { force: true });
    expect(useTestnetBalances.getState().balances).toEqual([]);
  });

  it('ne relit pas tant que les soldes sont frais, sauf demande', async () => {
    balances.sepolia = 10n ** 18n;
    await useTestnetBalances.getState().refresh(acct);
    balances.sepolia = 2n * 10n ** 18n;
    await useTestnetBalances.getState().refresh(acct);
    expect(useTestnetBalances.getState().balances[0].raw).toBe(10n ** 18n);
    await useTestnetBalances.getState().refresh(acct, { force: true });
    expect(useTestnetBalances.getState().balances[0].raw).toBe(2n * 10n ** 18n);
  });
});
