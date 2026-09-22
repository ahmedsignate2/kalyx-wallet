import { didReceive } from './receive';
import type { Holding } from './portfolioStore';

/** Avoir minimal : seuls `id`, `raw`, `price` et `verified` comptent ici. */
const h = (id: string, raw: bigint, opts: { price?: number; verified?: boolean } = {}): Holding => ({
  id,
  chainId: 'eth',
  kind: 'erc20',
  symbol: id.toUpperCase(),
  name: id,
  decimals: 6,
  raw,
  amount: Number(raw) / 1e6,
  price: opts.price ?? 1,
  fiat: (Number(raw) / 1e6) * (opts.price ?? 1),
  change24h: null,
  verified: opts.verified ?? true,
});

describe('didReceive — une hausse de cours n’est pas une réception (§8)', () => {
  it('détecte une quantité qui augmente', () => {
    expect(didReceive([h('usdc', 100n)], [h('usdc', 420n)])).toBe(true);
  });

  it('IGNORE un total qui monte parce que le cours a monté', () => {
    // Même quantité, prix multiplié par trois : le portefeuille vaut plus cher,
    // mais rien n’est arrivé. C’est la confusion que la règle existe pour éviter.
    const before = [h('eth', 1_000_000n, { price: 2000 })];
    const after = [h('eth', 1_000_000n, { price: 6000 })];
    expect(didReceive(before, after)).toBe(false);
  });

  it('détecte un jeton vérifié qui apparaît', () => {
    expect(didReceive([h('usdc', 100n)], [h('usdc', 100n), h('dai', 50n)])).toBe(true);
  });

  it('ignore un jeton NON vérifié qui apparaît (empoisonnement d’adresse)', () => {
    // Envoyer de la poussière pour se faire remarquer est précisément l’attaque.
    expect(didReceive([h('usdc', 100n)], [h('usdc', 100n), h('scam', 1n, { verified: false })])).toBe(false);
  });

  it('ignore une quantité qui baisse (un envoi)', () => {
    expect(didReceive([h('usdc', 420n)], [h('usdc', 100n)])).toBe(false);
  });

  it('ne déclenche rien au premier chargement', () => {
    // Sans point de comparaison, tout solde existant paraîtrait « reçu ».
    expect(didReceive([], [h('usdc', 999n)])).toBe(false);
  });

  it('ne déclenche rien quand rien ne change', () => {
    expect(didReceive([h('usdc', 100n)], [h('usdc', 100n)])).toBe(false);
  });
});
