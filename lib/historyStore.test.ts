/*
 * Les onglets remontent l'accueil et l'Historique à chaque passage : sans ces
 * règles, chaque changement d'onglet redemandait l'historique de tous les
 * réseaux à leurs indexeurs.
 */
const getHistory = jest.fn();
jest.mock('../src', () => ({ getAdapter: () => ({ getHistory }) }));
jest.mock('./kv', () => ({ getItem: async () => null, setItem: async () => {} }));

import { useHistoryStore, HISTORY_FRESH_MS } from './historyStore';

const tx = (hash: string) => ({ hash, chain: 'ethereum', timestamp: 1 }) as never;

beforeEach(() => {
  getHistory.mockReset();
  useHistoryStore.setState({ cache: {}, loading: {}, lastFetch: {} });
});

describe('fetchHistory', () => {
  it('réutilise une réponse fraîche sans réseau', async () => {
    getHistory.mockResolvedValue([tx('a')]);
    await useHistoryStore.getState().fetchHistory('ethereum', '0xAbc');
    const again = await useHistoryStore.getState().fetchHistory('ethereum', '0xabc');
    expect(getHistory).toHaveBeenCalledTimes(1);
    expect(again).toEqual([tx('a')]);
  });

  it('redemande une fois la fraîcheur passée', async () => {
    getHistory.mockResolvedValue([tx('a')]);
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    await useHistoryStore.getState().fetchHistory('ethereum', '0xabc');
    now.mockReturnValue(1_000_000 + HISTORY_FRESH_MS + 1);
    await useHistoryStore.getState().fetchHistory('ethereum', '0xabc');
    expect(getHistory).toHaveBeenCalledTimes(2);
    now.mockRestore();
  });

  it('force ignore la fraîcheur (tirer pour rafraîchir)', async () => {
    getHistory.mockResolvedValue([tx('a')]);
    await useHistoryStore.getState().fetchHistory('ethereum', '0xabc');
    await useHistoryStore.getState().fetchHistory('ethereum', '0xabc', { force: true });
    expect(getHistory).toHaveBeenCalledTimes(2);
  });

  it('fusionne deux demandes simultanées', async () => {
    let release!: (v: unknown) => void;
    getHistory.mockReturnValue(new Promise((r) => (release = r)));
    const a = useHistoryStore.getState().fetchHistory('ethereum', '0xabc');
    const b = useHistoryStore.getState().fetchHistory('ethereum', '0xabc', { force: true });
    release([tx('a')]);
    expect(await a).toEqual(await b);
    expect(getHistory).toHaveBeenCalledTimes(1);
  });

  it('markStale renvoie au réseau après un envoi, sans effacer « déjà chargé »', async () => {
    getHistory.mockResolvedValue([tx('a')]);
    await useHistoryStore.getState().fetchHistory('ethereum', '0xabc');
    useHistoryStore.getState().markStale('ethereum', '0xABC');
    expect(useHistoryStore.getState().lastFetch['ethereum:0xabc']).toBeGreaterThan(0);
    await useHistoryStore.getState().fetchHistory('ethereum', '0xabc');
    await useHistoryStore.getState().fetchHistory('ethereum', '0xabc');
    expect(getHistory).toHaveBeenCalledTimes(2);
  });

  it('garde le cache quand le réseau échoue', async () => {
    getHistory.mockResolvedValueOnce([tx('a')]).mockRejectedValueOnce(new Error('down'));
    await useHistoryStore.getState().fetchHistory('ethereum', '0xabc');
    const after = await useHistoryStore.getState().fetchHistory('ethereum', '0xabc', { force: true });
    expect(after).toEqual([tx('a')]);
    expect(useHistoryStore.getState().loading['ethereum:0xabc']).toBe(false);
  });
});
