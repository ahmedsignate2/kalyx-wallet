import { isAlchemyRpc, pauseFromResponse, pauseRelay, relayPaused, resetRelayPauses } from './relay';
import { parseRelayTokens } from '../tokens/relayTokens';

describe('relais Kalyx : disjoncteur', () => {
  afterEach(resetRelayPauses);

  it('quota (503) et débit (429) mettent en pause, le reste non', () => {
    expect(pauseFromResponse(503, '3600')).toBe(3600);
    expect(pauseFromResponse(503, null)).toBe(300);
    expect(pauseFromResponse(429, null)).toBe(30);
    expect(pauseFromResponse(200, '60')).toBe(0);
    expect(pauseFromResponse(400, null)).toBe(0);
  });

  it('la pause dure le temps indiqué, plafonnée à une heure', () => {
    const t = 1_000_000;
    pauseRelay('alchemy', 60, t);
    expect(relayPaused('alchemy', t + 59_000)).toBe(true);
    expect(relayPaused('alchemy', t + 61_000)).toBe(false);
    expect(relayPaused('helius', t)).toBe(false);
    pauseRelay('helius', 999_999, t);
    expect(relayPaused('helius', t + 3_600_000 - 1)).toBe(true);
    expect(relayPaused('helius', t + 3_600_000 + 1)).toBe(false);
  });

  it('reconnaît Alchemy en direct et par le relais', () => {
    expect(isAlchemyRpc('https://eth-mainnet.g.alchemy.com/v2/KEY')).toBe(true);
    expect(isAlchemyRpc('https://relay.example/rpc/alchemy/eth-mainnet')).toBe(true);
    expect(isAlchemyRpc('https://eth.llamarpc.com')).toBe(false);
  });
});

describe('relais Kalyx : tokens ERC-20', () => {
  const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
  it('garde les tokens lisibles, écarte le spam et l’illisible', () => {
    const out = parseRelayTokens([
      { contract: USDC, raw: '1500000', name: 'USD Coin', symbol: 'USDC', decimals: 6, logo: 'https://x/usdc.png' },
      { contract: '0x0000000000000000000000000000000000000001', raw: '5', name: 'Claim reward at t.me/x', symbol: 'REWARD', decimals: 18 },
      { contract: 'pas une adresse', raw: '5', symbol: 'X', decimals: 18 },
      { contract: USDC, raw: '-1', symbol: 'USDC', decimals: 6 },
    ]);
    expect(out).toEqual([{ contract: USDC, raw: 1500000n, name: 'USD Coin', symbol: 'USDC', decimals: 6, logo: 'https://x/usdc.png' }]);
  });
  it('une réponse illisible fait échouer le réseau', () => {
    expect(() => parseRelayTokens({})).toThrow();
  });
});

describe('relais Kalyx : API REST avec repli', () => {
  const realFetch = global.fetch;
  const resp = (status: number, retryAfter?: string) =>
    ({ status, ok: status < 400, headers: { get: (k: string) => (k === 'retry-after' ? retryAfter ?? null : null) } }) as unknown as Response;
  const load = (url: string) => {
    let mod!: typeof import('./relay');
    process.env.EXPO_PUBLIC_KALYX_RELAY_URL = url;
    jest.isolateModules(() => {
      mod = require('./relay');
    });
    delete process.env.EXPO_PUBLIC_KALYX_RELAY_URL;
    return mod;
  };
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('sans relais configuré : appel direct', async () => {
    const m = load('');
    const direct = jest.fn(async () => resp(200));
    global.fetch = jest.fn() as never;
    expect((await m.relayOrDirect('coingecko', '/cg/api/v3/search/trending', direct))?.status).toBe(200);
    expect(direct).toHaveBeenCalledTimes(1);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('relais disponible : sa réponse, sans appel direct', async () => {
    const m = load('https://relay.example/');
    const direct = jest.fn(async () => resp(200));
    global.fetch = jest.fn(async () => resp(200)) as never;
    expect((await m.relayOrDirect('coingecko', '/cg/api/v3/search/trending', direct))?.status).toBe(200);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('https://relay.example/cg/api/v3/search/trending');
    expect(direct).not.toHaveBeenCalled();
  });

  it('relais saturé : pause du seul service concerné, repli direct tout de suite', async () => {
    const m = load('https://relay.example');
    const direct = jest.fn(async () => resp(200));
    global.fetch = jest.fn(async () => resp(503, '600')) as never;
    expect((await m.relayOrDirect('lifi', '/lifi/v1/tokens?chains=1', direct))?.status).toBe(200);
    expect(direct).toHaveBeenCalledTimes(1);
    expect(m.relayPaused('lifi')).toBe(true);
    expect(m.relayPaused('coingecko')).toBe(false);
    // En pause : plus d'appel au relais.
    await m.relayOrDirect('lifi', '/lifi/v1/tokens?chains=1', direct);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('relais injoignable et aucun accès direct : null', async () => {
    const m = load('https://relay.example');
    global.fetch = jest.fn(async () => {
      throw new Error('offline');
    }) as never;
    expect(await m.relayOrDirect('heliusapi', '/helius/v0/transactions/simulate', null, { method: 'POST' })).toBeNull();
    expect(m.relayPaused('heliusapi')).toBe(true);
  });

  it('une erreur ordinaire du service (400) est rendue telle quelle', async () => {
    const m = load('https://relay.example');
    const direct = jest.fn(async () => resp(200));
    global.fetch = jest.fn(async () => resp(400)) as never;
    expect((await m.relayOrDirect('etherscan', '/etherscan/v2/api', direct))?.status).toBe(400);
    expect(direct).not.toHaveBeenCalled();
  });
});

describe('relais Kalyx : relais trop lent', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });
  const load = () => {
    let mod!: typeof import('./relay');
    process.env.EXPO_PUBLIC_KALYX_RELAY_URL = 'https://relay.example';
    jest.isolateModules(() => {
      mod = require('./relay');
    });
    delete process.env.EXPO_PUBLIC_KALYX_RELAY_URL;
    return mod;
  };
  // fetch qui ne répond jamais, sauf annulation.
  const hanging = jest.fn(
    (_u: string, init?: RequestInit) =>
      new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))),
  );

  it('au-delà du délai : appel direct, sans attendre le relais', async () => {
    const m = load();
    global.fetch = hanging as never;
    const direct = jest.fn(async () => ({ status: 200, ok: true, headers: { get: () => null } }) as unknown as Response);
    const t0 = Date.now();
    const res = await m.relayOrDirect('coingecko', '/cg/api/v3/search/trending', direct, undefined, 50);
    expect(res?.status).toBe(200);
    expect(Date.now() - t0).toBeLessThan(2_000);
    expect(m.relayPaused('coingecko')).toBe(true);
  });

  it("annulé par l'appelant : pas de pause, pas de repli", async () => {
    const m = load();
    global.fetch = hanging as never;
    const ctrl = new AbortController();
    const direct = jest.fn();
    const p = m.relayOrDirect('heliusapi', '/helius/v0/addresses/x/names', direct as never, { signal: ctrl.signal }, 10_000);
    ctrl.abort();
    await expect(p).rejects.toThrow();
    expect(direct).not.toHaveBeenCalled();
    expect(m.relayPaused('heliusapi')).toBe(false);
  });
});
