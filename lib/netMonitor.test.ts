let mockDecoy = false;
let mockDecoyListener: ((on: boolean) => void) | null = null;
jest.mock('./sessionMode', () => ({
  isDecoySession: () => mockDecoy,
  onDecoyChange: (l: (on: boolean) => void) => {
    mockDecoyListener = l;
    return () => {};
  },
}));

import { installNetMonitor, netEntries, clearNetEntries, hostStats, hostOf, rpcMethodOf } from './netMonitor';

const API_KEY = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345';
const SIGNED_TX = '0x02f8b20181e8843b9aca0085174876e800830186a094' + 'ab'.repeat(60);

function fakeResponse(status: number, len?: number) {
  let consumed = false;
  return {
    status,
    get bodyUsed() {
      return consumed;
    },
    headers: { get: (k: string) => (k === 'content-length' && len !== undefined ? String(len) : null) },
    json: async () => {
      consumed = true;
      return {};
    },
    clone: jest.fn(),
  };
}

describe('Moniteur réseau', () => {
  const res = fakeResponse(200, 123);
  const g: { fetch?: unknown } = {};
  const underlying = jest.fn(async (..._a: unknown[]) => res);
  g.fetch = underlying;
  installNetMonitor(g);
  const f = g.fetch as (...a: unknown[]) => Promise<unknown>;

  beforeEach(() => {
    mockDecoy = false;
    clearNetEntries();
    underlying.mockClear();
  });

  it("n'enregistre que l'hôte, la méthode, le statut, la durée et la taille — jamais clé, chemin, corps ni en-têtes", async () => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_sendRawTransaction', params: [SIGNED_TX] });
    await f(`https://eth-mainnet.g.alchemy.com/v2/${API_KEY}?apikey=${API_KEY}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body,
    });
    const e = netEntries();
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ host: 'eth-mainnet.g.alchemy.com', rpc: 'eth_sendRawTransaction', verb: 'POST', status: 200, size: 123 });
    expect(Object.keys(e[0]).sort()).toEqual(['host', 'ms', 'rpc', 'size', 'status', 't', 'verb']);
    const dump = JSON.stringify(e);
    expect(dump).not.toContain(API_KEY);
    expect(dump).not.toContain('/v2');
    expect(dump).not.toContain(SIGNED_TX.slice(0, 30));
    expect(dump).not.toContain('Bearer');
  });

  it('rend la MÊME Response, non lue ni clonée, et passe les arguments intacts', async () => {
    const init = { method: 'POST', body: '{"method":"eth_call"}' };
    const out = await f('https://rpc.example.org/', init);
    expect(out).toBe(res);
    expect(res.bodyUsed).toBe(false);
    expect(res.clone).not.toHaveBeenCalled();
    expect(underlying).toHaveBeenCalledWith('https://rpc.example.org/', init);
  });

  it("relance la MÊME erreur (rejet et levée synchrone), et compte l'échec sans son message", async () => {
    const boom = new TypeError(`Network request failed https://x.io/${API_KEY}`);
    underlying.mockImplementationOnce(async () => {
      throw boom;
    });
    await expect(f('https://x.io/a')).rejects.toBe(boom);
    const sync = new Error('sync');
    underlying.mockImplementationOnce(() => {
      throw sync;
    });
    expect(() => f('https://y.io/')).toThrow(sync);
    const e = netEntries();
    expect(e.map((x) => [x.host, x.status, x.err])).toEqual([['x.io', 0, 'TypeError'], ['y.io', 0, 'Error']]);
    expect(JSON.stringify(e)).not.toContain(API_KEY);
  });

  it('session leurre : rien enregistré, requête quand même transmise ; tampon vidé à l’entrée', async () => {
    await f('https://a.io/');
    expect(netEntries()).toHaveLength(1);
    mockDecoy = true;
    mockDecoyListener?.(true);
    expect(netEntries()).toHaveLength(0);
    const out = await f('https://b.io/');
    expect(out).toBe(res);
    expect(underlying).toHaveBeenCalledTimes(2);
    expect(netEntries()).toHaveLength(0);
  });

  it('tampon limité à 200 et statistiques par hôte (p50, taux d’échec)', async () => {
    for (let i = 0; i < 205; i++) await f('https://h.io/');
    expect(netEntries()).toHaveLength(200);
    clearNetEntries();
    underlying.mockImplementationOnce(async () => fakeResponse(500));
    await f('https://h.io/');
    await f('https://h.io/');
    const [s] = hostStats();
    expect(s).toMatchObject({ host: 'h.io', count: 2, failRate: 0.5 });
  });

  it('un seul patch, même installé deux fois', () => {
    const before = g.fetch;
    installNetMonitor(g);
    expect(g.fetch).toBe(before);
  });

  it("hôte : sans identifiants ni sous-domaine-jeton ; méthode : jamais d'un gros corps", () => {
    expect(hostOf('https://user:pass@rpc.io/x?y=1')).toBe('rpc.io');
    expect(hostOf(`https://${API_KEY}.quiknode.pro/abc`)).toBe('[…].quiknode.pro');
    expect(rpcMethodOf('{"method":"getSlot"}')).toBe('getSlot');
    expect(rpcMethodOf('[{"method":"a"},{"method":"b"}]')).toBe('batch×2 a');
    expect(rpcMethodOf(`{"method":"eth_call","x":"${'a'.repeat(20000)}"}`)).toBeUndefined();
  });
});
