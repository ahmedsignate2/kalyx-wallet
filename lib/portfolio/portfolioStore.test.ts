/*
 * `hydrate` lisait « …eur » quand `refresh` écrivait « …eur.mainnet » : le
 * cliché n'était jamais relu, et chaque retour sur l'accueil repartait de zéro.
 */
const store = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (k: string) => store.get(k) ?? null,
    setItem: async (k: string, v: string) => void store.set(k, v),
  },
}));

jest.mock('../earn/earnStore', () => ({ safeNum: (n: number) => n }));
jest.mock('../aura', () => ({ aura: { pulse: () => {} } }));

import { usePortfolioStore, snapshotKey } from './portfolioStore';

const acct = { evmAddress: '0xAbC', btcAddress: 'bc1q' } as never;
const snap = { holdings: [], total: 42, pnl24h: null, pnl24hPct: null, at: 123 };

beforeEach(() => {
  store.clear();
  usePortfolioStore.setState({ key: null, holdings: [], total: 0, at: 0, loading: false, invalidated: false });
});

describe('cliché du portefeuille', () => {
  it('hydrate relit la clé sous laquelle refresh écrit', async () => {
    store.set(snapshotKey(acct, 'eur'), JSON.stringify(snap));
    await usePortfolioStore.getState().hydrate(acct, 'eur');
    expect(usePortfolioStore.getState().total).toBe(42);
    expect(usePortfolioStore.getState().key).toBe(snapshotKey(acct, 'eur'));
  });

  it('sépare le cliché avec réseaux de test', () => {
    expect(snapshotKey(acct, 'eur', true)).not.toBe(snapshotKey(acct, 'eur'));
  });

  it('un cliché frais n’est pas redemandé, sauf après invalidate', async () => {
    const key = snapshotKey(acct, 'eur');
    usePortfolioStore.setState({ key, at: Date.now(), fromCache: true });
    const refresh = usePortfolioStore.getState().refresh;
    await refresh(acct, 'eur');
    expect(usePortfolioStore.getState().loading).toBe(false);
    expect(usePortfolioStore.getState().at).toBeGreaterThan(0);

    usePortfolioStore.getState().invalidate();
    const pending = refresh(acct, 'eur');
    expect(usePortfolioStore.getState().loading).toBe(true);
    await pending.catch(() => {});
  });
});
