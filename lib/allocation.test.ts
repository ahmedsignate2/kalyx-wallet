import { allocationSlices } from './allocation';

const items = [
  { symbol: 'ETH', name: 'Ethereum', chainId: 'ethereum', fiat: 600, coingeckoId: 'ethereum' },
  { symbol: 'ETH', name: 'Ethereum', chainId: 'base', fiat: 200, coingeckoId: 'ethereum' },
  { symbol: 'USDC', name: 'USD Coin', chainId: 'base', fiat: 150, coingeckoId: 'usd-coin' },
  { symbol: 'SOL', name: 'Solana', chainId: 'solana', fiat: 50, coingeckoId: 'solana' },
  { symbol: 'DUST', name: 'Dust', chainId: 'ethereum', fiat: 0 },
];

describe('allocationSlices', () => {
  it('par actif : un même actif sur plusieurs réseaux compte une fois', () => {
    const s = allocationSlices(items, 'asset', 'Autres');
    expect(s.map((x) => [x.label, Math.round(x.pct)])).toEqual([['ETH', 80], ['USDC', 15], ['SOL', 5]]);
    expect(s[0].color).toBe('#627EEA');
  });
  it('par réseau : regroupe par chaîne', () => {
    const s = allocationSlices(items, 'chain', 'Autres');
    expect(s.map((x) => [x.key, Math.round(x.pct)])).toEqual([['ethereum', 60], ['base', 35], ['solana', 5]]);
  });
  it('au-delà de `top`, le reste devient « Autres » ; rien si tout vaut 0', () => {
    const s = allocationSlices(items, 'asset', 'Autres', 1);
    expect(s.map((x) => x.label)).toEqual(['ETH', 'Autres']);
    expect(allocationSlices([{ symbol: 'X', name: 'X', chainId: 'ethereum', fiat: 0 }], 'asset', 'Autres')).toEqual([]);
  });
});
