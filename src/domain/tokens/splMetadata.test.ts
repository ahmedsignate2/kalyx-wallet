import { buildSearchUrl, parseSearchResponse, fetchSplMetadata } from './splMetadata';

const WIF = 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm'; // dans KNOWN_MINTS (curé)
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // curé (KNOWN_MINTS)
const RANDOM = 'So11111111111111111111111111111111111111112'; // NON curé
const PENGU = '2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv'; // NON curé

describe('buildSearchUrl', () => {
  it('joint les mints par des virgules', () => {
    expect(buildSearchUrl([WIF, RANDOM])).toBe(
      `https://lite-api.jup.ag/tokens/v2/search?query=${WIF},${RANDOM}`,
    );
  });
});

describe('parseSearchResponse', () => {
  it('mappe id → {symbol, name, logo}', () => {
    const out = parseSearchResponse([
      { id: WIF, name: 'dogwifhat', symbol: '$WIF', icon: 'https://img/wif.png' },
    ]);
    expect(out[WIF]).toEqual({ symbol: '$WIF', name: 'dogwifhat', logo: 'https://img/wif.png' });
  });

  it('replie name sur symbol si name absent', () => {
    expect(parseSearchResponse([{ id: WIF, symbol: 'WIF' }])[WIF]).toEqual({
      symbol: 'WIF',
      name: 'WIF',
      logo: undefined,
    });
  });

  it('ignore les entrées sans id ou sans symbole, et les réponses non-tableau', () => {
    expect(parseSearchResponse([{ name: 'x' }, { id: WIF }])).toEqual({});
    expect(parseSearchResponse(null)).toEqual({});
    expect(parseSearchResponse({ error: 'nope' })).toEqual({});
  });
});

describe('fetchSplMetadata', () => {
  it('ignore les mints déjà curés (aucun appel réseau si tous connus)', async () => {
    const spy = jest.fn();
    const out = await fetchSplMetadata([USDC], spy as never);
    expect(spy).not.toHaveBeenCalled();
    expect(out).toEqual({});
  });

  it('n’interroge que les mints inconnus et parse la réponse', async () => {
    const fetchImpl = jest.fn(async (url: string) => {
      // seul le mint inconnu (PENGU) doit figurer dans l’URL, pas l’USDC curé
      expect(url).toContain(PENGU);
      expect(url).not.toContain(USDC);
      return { json: async () => [{ id: PENGU, name: 'Pudgy Penguins', symbol: 'PENGU', icon: 'x' }] };
    });
    const out = await fetchSplMetadata([USDC, PENGU], fetchImpl as never);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(out[PENGU].symbol).toBe('PENGU');
  });

  it('dégrade en {} si le réseau échoue (ne lève jamais)', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error('offline');
    });
    await expect(fetchSplMetadata([RANDOM], fetchImpl as never)).resolves.toEqual({});
  });
});
