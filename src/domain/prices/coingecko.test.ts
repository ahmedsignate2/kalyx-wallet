import {
  parseSimplePrices,
  parseMarkets,
  sortMarkets,
  parseCoinDetail,
  parseMarketChart,
  parseMarketChartPoints,
  parseSearchCoins,
} from './coingecko';

describe('parseSimplePrices', () => {
  const json = {
    bitcoin: { eur: 53623, eur_24h_change: 1.14 },
    ethereum: { eur: 1487.95, eur_24h_change: 4.55 },
  };
  it('extrait prix + variation par id', () => {
    const p = parseSimplePrices(json, 'eur');
    expect(p.bitcoin).toEqual({ id: 'bitcoin', price: 53623, change24h: 1.14 });
    expect(p.ethereum.price).toBeCloseTo(1487.95);
  });
  it('robuste sur entrée vide/malformée', () => {
    expect(parseSimplePrices(null, 'eur')).toEqual({});
    expect(parseSimplePrices({ x: {} }, 'eur')).toEqual({});
  });
});

describe('parseMarkets', () => {
  const json = [
    {
      id: 'bitcoin',
      symbol: 'btc',
      name: 'Bitcoin',
      image: 'http://img',
      current_price: 53602,
      price_change_percentage_24h: 2.35,
      sparkline_in_7d: { price: [1, 2, 3] },
    },
    { id: 'ethereum', symbol: 'eth', name: 'Ethereum', current_price: 3452, price_change_percentage_24h: -1.02 },
  ];
  it('normalise les coins', () => {
    const m = parseMarkets(json);
    expect(m[0]).toMatchObject({ id: 'bitcoin', symbol: 'BTC', price: 53602, change24h: 2.35 });
    expect(m[0].sparkline).toEqual([1, 2, 3]);
    expect(m[1].sparkline).toEqual([]); // pas de sparkline -> []
  });
  it('renvoie [] sur entrée non-tableau', () => {
    expect(parseMarkets({ status: 'error' })).toEqual([]);
  });
});

describe('sortMarkets', () => {
  const coins = parseMarkets([
    { id: 'a', symbol: 'a', name: 'A', current_price: 1, price_change_percentage_24h: 5 },
    { id: 'b', symbol: 'b', name: 'B', current_price: 1, price_change_percentage_24h: -3 },
    { id: 'c', symbol: 'c', name: 'C', current_price: 1, price_change_percentage_24h: 1 },
  ]);
  it('gagnants en tête', () => {
    expect(sortMarkets(coins, 'gainers').map((c) => c.id)).toEqual(['a', 'c', 'b']);
  });
  it('perdants en tête', () => {
    expect(sortMarkets(coins, 'losers').map((c) => c.id)).toEqual(['b', 'c', 'a']);
  });
  it('top garde l’ordre market cap', () => {
    expect(sortMarkets(coins, 'top').map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('parseCoinDetail', () => {
  const json = {
    id: 'ethereum',
    symbol: 'eth',
    name: 'Ethereum',
    image: { large: 'http://img/large.png', small: 'http://img/small.png' },
    market_data: {
      current_price: { eur: 1487.95, usd: 1600 },
      price_change_percentage_24h: 4.55,
      market_cap: { eur: 180000000000 },
    },
    description: { en: 'Ethereum is a <a href="x">decentralized</a> platform.\nSmart contracts.', fr: 'Ethereum est une plateforme décentralisée.' },
  };
  it('extrait prix, variation, market cap, image', () => {
    const d = parseCoinDetail(json, 'eur')!;
    expect(d).toMatchObject({ id: 'ethereum', symbol: 'ETH', price: 1487.95, change24h: 4.55, marketCap: 180000000000, image: 'http://img/large.png' });
  });
  it('nettoie le HTML de la description et respecte la langue', () => {
    expect(parseCoinDetail(json, 'eur', 'en')!.description).toBe('Ethereum is a decentralized platform. Smart contracts.');
    expect(parseCoinDetail(json, 'eur', 'fr')!.description).toBe('Ethereum est une plateforme décentralisée.');
  });
  it('conserve une description longue pour Lire la suite', () => {
    const description = `${'A'.repeat(450)} environment`;
    const parsed = parseCoinDetail({ ...json, description: { en: description } }, 'eur', 'en')!;
    expect(parsed.description).toBe(description);
    expect(parsed.description.length).toBeGreaterThan(400);
  });
  it('renvoie null sur entrée invalide', () => {
    expect(parseCoinDetail(null, 'eur')).toBeNull();
    expect(parseCoinDetail({}, 'eur')).toBeNull();
  });
  it('extrait les plateformes (contrat par chaîne), en ignorant les entrées vides', () => {
    const withPlatforms = { ...json, platforms: { 'sei-v2': '0xabc', '': '', ethereum: '  ' } };
    expect(parseCoinDetail(withPlatforms, 'eur')!.platforms).toEqual({ 'sei-v2': '0xabc' });
  });
  it('platforms est un objet vide quand absent', () => {
    expect(parseCoinDetail(json, 'eur')!.platforms).toEqual({});
  });
});

describe('parseMarketChart', () => {
  it('extrait la série de prix', () => {
    expect(parseMarketChart({ prices: [[1, 100], [2, 110], [3, 105]] })).toEqual([100, 110, 105]);
  });
  it('robuste sur entrée vide', () => {
    expect(parseMarketChart({})).toEqual([]);
    expect(parseMarketChart(null)).toEqual([]);
  });
});

describe('parseMarketChartPoints', () => {
  it('extrait les points horodatés', () => {
    expect(parseMarketChartPoints({ prices: [[1000, 100], [2000, 110]] })).toEqual([
      { t: 1000, v: 100 },
      { t: 2000, v: 110 },
    ]);
  });
  it('ignore les timestamps invalides et robuste sur entrée vide', () => {
    expect(parseMarketChartPoints({ prices: [[0, 5], ['x', 6], [3000, 7]] })).toEqual([{ t: 3000, v: 7 }]);
    expect(parseMarketChartPoints({})).toEqual([]);
    expect(parseMarketChartPoints(null)).toEqual([]);
  });
});

describe('parseSearchCoins', () => {
  it('normalise les résultats de recherche', () => {
    const json = {
      coins: [
        { id: 'ethereum', name: 'Ethereum', symbol: 'eth', thumb: 'http://t', market_cap_rank: 2 },
        { id: 'optimism', name: 'Optimism', symbol: 'op', large: 'http://l' },
      ],
    };
    const r = parseSearchCoins(json);
    expect(r[0]).toEqual({ id: 'ethereum', name: 'Ethereum', symbol: 'ETH', thumb: 'http://t', rank: 2 });
    expect(r[1]).toMatchObject({ id: 'optimism', symbol: 'OP', thumb: 'http://l', rank: null });
  });
  it('robuste sur entrée vide', () => {
    expect(parseSearchCoins(null)).toEqual([]);
    expect(parseSearchCoins({})).toEqual([]);
  });
});
