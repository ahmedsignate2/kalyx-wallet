/** Prix Alchemy par le relais : seulement les réseaux du relais, clés au format DefiLlama, rien d'inventé. */
describe('prix Alchemy (relais)', () => {
  const RELAY = 'https://relay.test';
  const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
  const base = { id: 'base', family: 'evm', rpcUrls: ['https://mainnet.base.org', `${RELAY}/rpc/alchemy/base-mainnet`] };
  const other = { id: 'kava', family: 'evm', rpcUrls: ['https://evm.kava.io'] };

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_KALYX_RELAY_URL;
    jest.resetModules();
    (global as { fetch?: unknown }).fetch = undefined;
  });

  it('sans relais : aucune requête', async () => {
    const f = jest.fn();
    (global as { fetch?: unknown }).fetch = f;
    const { getRelayTokenPricesUsd } = await import('./alchemyPrices');
    expect(await getRelayTokenPricesUsd([{ chain: base as never, address: USDC_BASE }])).toEqual({});
    expect(f).not.toHaveBeenCalled();
  });

  it('avec relais : demande les tokens des réseaux servis, rend les clés Kalyx', async () => {
    process.env.EXPO_PUBLIC_KALYX_RELAY_URL = RELAY;
    const f = jest.fn(async (_url: string, init: { body: string }) => {
      const asked = JSON.parse(init.body).tokens;
      expect(asked).toEqual([{ chain: 'base-mainnet', address: USDC_BASE }]);
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ prices: { [`base-mainnet:${USDC_BASE.toLowerCase()}`]: 0.9998, 'base-mainnet:0xdead': 'x' } }) };
    });
    (global as { fetch?: unknown }).fetch = f;
    const { getRelayTokenPricesUsd } = await import('./alchemyPrices');
    const out = await getRelayTokenPricesUsd([{ chain: base as never, address: USDC_BASE }, { chain: other as never, address: USDC_BASE }]);
    expect(out).toEqual({ [`base:${USDC_BASE.toLowerCase()}`]: 0.9998 });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('quota (503) : rien, et le relais se met en pause', async () => {
    process.env.EXPO_PUBLIC_KALYX_RELAY_URL = RELAY;
    (global as { fetch?: unknown }).fetch = jest.fn(async () => ({ ok: false, status: 503, headers: { get: () => '300' }, json: async () => ({}) }));
    const { getRelayTokenPricesUsd } = await import('./alchemyPrices');
    const { relayPaused } = await import('../net/relay');
    expect(await getRelayTokenPricesUsd([{ chain: base as never, address: USDC_BASE }])).toEqual({});
    expect(relayPaused('alchemy')).toBe(true);
  });
});
