import { SolanaChainAdapter } from './SolanaChainAdapter';
import { SOLANA } from './configs';
import { resetRpcHealth } from './net';

describe('Solana : un serveur qui refuse passe la main au suivant', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('page de refus illisible (403 HTML) puis réponse du relais', async () => {
    resetRpcHealth();
    const calls: string[] = [];
    global.fetch = jest.fn(async (url: string) => {
      calls.push(url);
      if (url.includes('mainnet-beta')) return { ok: false, status: 403, json: async () => { throw new SyntaxError('Unexpected token <'); } };
      if (url.includes('ankr')) return { ok: true, status: 200, json: async () => ({ error: { code: -32000, message: 'Unauthorized: You must authenticate your request with an API key' } }) };
      return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, result: { value: 1_500_000_000 } }) };
    }) as never;
    const adapter = new SolanaChainAdapter({ ...SOLANA, rpcUrls: ['https://api.mainnet-beta.solana.com', 'https://rpc.ankr.com/solana', 'https://relay.example/rpc/helius'] });
    const v = await adapter.rpc<{ value: number }>('getBalance', ['9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM']);
    expect(v.value).toBe(1_500_000_000);
    expect(calls).toEqual(['https://api.mainnet-beta.solana.com', 'https://rpc.ankr.com/solana', 'https://relay.example/rpc/helius']);
  });

  it('relais en quota (503 { error: "quota" }) : les nœuds publics prennent la suite', async () => {
    resetRpcHealth();
    global.fetch = jest.fn(async (url: string) =>
      url.includes('relay')
        ? { ok: false, status: 503, json: async () => ({ error: 'quota' }) }
        : { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, result: { value: 7 } }) },
    ) as never;
    const adapter = new SolanaChainAdapter({ ...SOLANA, rpcUrls: ['https://relay.example/rpc/helius', 'https://api.mainnet-beta.solana.com'] });
    expect((await adapter.rpc<{ value: number }>('getBalance', ['9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'])).value).toBe(7);
  });

  it('une vraie erreur JSON-RPC (paramètre invalide) reste remontée telle quelle', async () => {
    resetRpcHealth();
    const calls: string[] = [];
    global.fetch = jest.fn(async (url: string) => (calls.push(url), { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'Invalid param: WrongSize' } }) })) as never;
    const adapter = new SolanaChainAdapter({ ...SOLANA, rpcUrls: ['https://a.example', 'https://b.example'] });
    await expect(adapter.rpc('getBalance', ['x'])).rejects.toThrow('Invalid param');
    expect(calls).toEqual(['https://a.example']);
  });
});
