import { EvmChainAdapter } from './EvmChainAdapter';
import { BASE } from './configs';

const OWNER = '0x84e90b03e29c28b22c645ad6c0badc9574995eb3';
const OTHER = '0x2b2c81e08f1af8835a78bb2a90ae924ace0ea4be';
const reply = (id: number, transfers: unknown[]) => ({ jsonrpc: '2.0', id, result: { transfers } });

describe('Historique Alchemy : reçus et envoyés en une seule requête', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('un seul appel, un lot de deux demandes, les deux réponses fusionnées', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => [
        reply(1, [{ hash: '0xa1', from: OTHER, to: OWNER, category: 'external', blockNum: '0x10', rawContract: { value: '0x1' }, metadata: { blockTimestamp: '2026-10-01T00:00:00Z' } }]),
        reply(2, [{ hash: '0xb2', from: OWNER, to: OTHER, category: 'external', blockNum: '0x11', rawContract: { value: '0x2' }, metadata: { blockTimestamp: '2026-10-02T00:00:00Z' } }]),
      ],
    }));
    global.fetch = fetchMock as never;
    const adapter = new EvmChainAdapter({ ...BASE, rpcUrls: ['https://base-mainnet.g.alchemy.com/v2/CLE-FACTICE-000000000'] });
    const txs = await adapter.getHistory(OWNER);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(Array.isArray(body)).toBe(true);
    expect(body.map((b: { params: Record<string, unknown>[] }) => Object.keys(b.params[0]).find((k) => k.endsWith('Address')))).toEqual(['toAddress', 'fromAddress']);
    expect(txs.map((t) => t.hash).sort()).toEqual(['0xa1', '0xb2']);
  });
});
