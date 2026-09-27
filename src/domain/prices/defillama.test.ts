import { getLlamaTokenPricesUsd, llamaKey, parseLlamaPrices, MIN_CONFIDENCE } from './defillama';

// Réponse relevée le 27/09 (coins.llama.fi), plus un jeton peu fiable ajouté.
const LIVE = {
  coins: {
    'base:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': { decimals: 6, symbol: 'USDC', price: 0.9998688459530676, timestamp: 1790525440, confidence: 0.99 },
    'base:0x4200000000000000000000000000000000000006': { decimals: 18, symbol: 'WETH', price: 2692.943453663775, timestamp: 1790525440, confidence: 0.99 },
    'solana:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { decimals: 6, symbol: 'usdc', price: 0.9998688459530676, timestamp: 1790525440, confidence: 0.99 },
    'base:0xdead000000000000000000000000000000000000': { symbol: 'SCAM', price: 12.5, confidence: 0.4 },
  },
};

describe('DefiLlama', () => {
  it('ignore un prix peu fiable (jeton d’arnaque coté sur un pool vide)', () => {
    const p = parseLlamaPrices(LIVE);
    expect(p['base:0x4200000000000000000000000000000000000006']).toBeCloseTo(2692.94, 1);
    expect(p['base:0xdead000000000000000000000000000000000000']).toBeUndefined();
    expect(MIN_CONFIDENCE).toBeGreaterThan(0.4);
  });

  it('UNE requête pour tous les réseaux, clés rendues dans nos identifiants', async () => {
    const urls: string[] = [];
    const out = await getLlamaTokenPricesUsd(
      [
        { chainId: 'base', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
        { chainId: 'base', address: '0x4200000000000000000000000000000000000006' },
        { chainId: 'solana', address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
        { chainId: 'reseau-inconnu', address: '0x1' },
      ],
      async (u) => { urls.push(u); return { ok: true, json: async () => LIVE }; },
    );
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('base:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913');
    expect(urls[0]).toContain('solana:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    expect(urls[0]).not.toContain('reseau-inconnu');
    expect(out[llamaKey('base', '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913')]).toBeCloseTo(0.9999, 3);
    expect(out[llamaKey('solana', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')]).toBeCloseTo(0.9999, 3);
  });

  it('réseau muet : rien, sans lever', async () => {
    const out = await getLlamaTokenPricesUsd([{ chainId: 'base', address: '0x1' }], async () => { throw new Error('offline'); });
    expect(out).toEqual({});
  });

  it('découpe les longues listes en plusieurs requêtes', async () => {
    const urls: string[] = [];
    const refs = Array.from({ length: 130 }, (_, i) => ({ chainId: 'ethereum', address: `0x${i.toString(16).padStart(40, '0')}` }));
    await getLlamaTokenPricesUsd(refs, async (u) => { urls.push(u); return { ok: true, json: async () => ({ coins: {} }) }; });
    expect(urls.length).toBe(3);
  });
});

describe('taux de change de secours', () => {
  it('USD → 1 sans réseau ; sinon le taux Frankfurter, puis le dernier connu', async () => {
    const { getUsdFxRate } = await import('./defillama');
    expect(await getUsdFxRate('usd', async () => { throw new Error('ne doit pas être appelé'); })).toBe(1);
    const ok = async () => ({ ok: true, json: async () => ({ amount: 1, base: 'USD', rates: { GBP: 0.75458 } }) });
    expect(await getUsdFxRate('gbp', ok)).toBeCloseTo(0.75458);
    expect(await getUsdFxRate('xx1', ok)).toBe(0);
  });

  it('prix d’une pièce native par son identifiant CoinGecko', async () => {
    const urls: string[] = [];
    const out = await getLlamaTokenPricesUsd([{ chainId: 'coingecko', address: 'ethereum' }], async (u) => {
      urls.push(u);
      return { ok: true, json: async () => ({ coins: { 'coingecko:ethereum': { price: 2689.49, confidence: 0.99 } } }) };
    });
    expect(urls[0]).toContain('coingecko:ethereum');
    expect(out[llamaKey('coingecko', 'ethereum')]).toBeCloseTo(2689.49);
  });
});
