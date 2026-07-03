import { parseSimplePrices, parseMarkets, sortMarkets } from './coingecko';

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
