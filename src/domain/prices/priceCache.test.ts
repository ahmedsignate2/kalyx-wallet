import { attachPriceCacheStorage, cacheTtlFor, effectiveDays, getMarkets } from './coingecko';

describe('cache des prix', () => {
  it('« Tout » demande 365 jours (limite de l’API publique)', () => {
    expect(effectiveDays('max')).toBe('365');
    expect(effectiveDays('7')).toBe('7');
  });

  it('durée de vie selon la donnée', () => {
    expect(cacheTtlFor('markets:eur:20')).toBe(120_000);
    expect(cacheTtlFor('chart:bitcoin:eur:1')).toBe(120_000);
    expect(cacheTtlFor('chart:bitcoin:eur:365')).toBe(7_200_000);
    expect(cacheTtlFor('prices:x')).toBe(45_000);
  });

  it('relit le disque au démarrage et sert la valeur sans réseau', async () => {
    const coin = { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', image: '', price: 1, change24h: 0, marketCap: 1, sparkline: [] };
    const store: Record<string, string> = {
      'kalyx.priceCache.v1': JSON.stringify([['markets:eur:20', { value: [coin], ts: Date.now() }]]),
    };
    await attachPriceCacheStorage({ getItem: async (k) => store[k] ?? null, setItem: async (k, v) => { store[k] = v; } });
    const fetchSpy = jest.fn(() => Promise.reject(new Error('pas de réseau')));
    (global as unknown as { fetch: unknown }).fetch = fetchSpy;
    const res = await getMarkets('eur', 20);
    expect(res).toHaveLength(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('deux demandes simultanées ne font qu’un appel', async () => {
    let calls = 0;
    (global as unknown as { fetch: unknown }).fetch = jest.fn(async () => {
      calls++;
      return { ok: true, status: 200, json: async () => [] } as unknown as Response;
    });
    await Promise.all([getMarkets('usd', 5), getMarkets('usd', 5)]);
    expect(calls).toBe(1);
  });
});
