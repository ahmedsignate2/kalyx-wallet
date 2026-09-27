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

describe('réseau muet : les actifs ne disparaissent pas', () => {
  const { carryOver } = require('./portfolioStore');
  const h = (chainId: string, kind: string, id: string, fiat: number) => ({ id, chainId, kind, fiat, amount: fiat, raw: 1n, verified: true });
  const before = [h('base', 'native', 'base:native', 50), h('base', 'erc20', 'base:0xusdc', 100), h('arbitrum', 'native', 'arbitrum:native', 30)];

  it('garde le natif d’un réseau dont la lecture a échoué', () => {
    const fresh = [h('base', 'erc20', 'base:0xusdc', 100)];
    const out = carryOver(before, fresh, new Set(['base:native']));
    expect(out.map((x: { id: string }) => x.id)).toEqual(['base:0xusdc', 'base:native']);
  });

  it('garde les jetons d’un réseau dont la liste a échoué, sans doublon', () => {
    const fresh = [h('base', 'native', 'base:native', 50)];
    const out = carryOver(before, fresh, new Set(['base:tokens']));
    expect(out.map((x: { id: string }) => x.id).sort()).toEqual(['base:0xusdc', 'base:native']);
  });

  it('un solde RELU à zéro disparaît bien (pas d’échec déclaré)', () => {
    expect(carryOver(before, [], new Set())).toEqual([]);
  });
});

describe('prix absent cette fois : le dernier connu est gardé', () => {
  const { carryOver } = require('./portfolioStore');
  const h = (id: string, price: number, verified = true) => ({ id, chainId: 'base', kind: 'erc20', amount: 10, raw: 10n, price, fiat: verified ? 10 * price : 0, verified, change24h: null });
  it('un jeton sans prix garde le précédent (et reste vérifié)', () => {
    const out = carryOver([h('base:0xa', 2)], [h('base:0xa', 0, false)], new Set());
    expect(out[0]).toMatchObject({ price: 2, fiat: 20, verified: true });
  });
  it('un nouveau prix l’emporte toujours', () => {
    expect(carryOver([h('base:0xa', 2)], [h('base:0xa', 3)], new Set())[0]).toMatchObject({ price: 3, fiat: 30 });
  });
});
