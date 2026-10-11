import { rpcProxy, RpcProxyError, READONLY_METHODS } from './dappProvider';

const ok = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

describe('rpcProxy', () => {
  it('refuse toute méthode hors lecture seule, sans appel réseau', async () => {
    const fetcher = jest.fn();
    for (const m of ['eth_sendTransaction', 'eth_sendRawTransaction', 'personal_sign', 'eth_sign', 'wallet_addEthereumChain']) {
      expect(READONLY_METHODS.has(m)).toBe(false);
      await expect(rpcProxy(['https://rpc'], m, [], { fetcher: fetcher as unknown as typeof fetch })).rejects.toMatchObject({ code: -32601 });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('timeout : un nœud muet est abandonné, le suivant répond', async () => {
    const calls: string[] = [];
    const fetcher = ((url: string, init: RequestInit) => {
      calls.push(url);
      if (url === 'https://slow') {
        return new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(new Error('aborted'))));
      }
      return Promise.resolve(ok({ jsonrpc: '2.0', id: 1, result: '0x10' }));
    }) as unknown as typeof fetch;
    await expect(rpcProxy(['https://slow', 'https://fast'], 'eth_blockNumber', [], { timeoutMs: 30, fetcher })).resolves.toBe('0x10');
    expect(calls).toEqual(['https://slow', 'https://fast']);
  });

  it('timeout sur tous les nœuds : erreur JSON-RPC propre', async () => {
    const fetcher = ((_: string, init: RequestInit) => new Promise((_r, reject) => init.signal!.addEventListener('abort', () => reject(new Error('aborted'))))) as unknown as typeof fetch;
    const err = await rpcProxy(['https://a'], 'eth_gasPrice', [], { timeoutMs: 20, fetcher }).catch((e) => e);
    expect(err).toBeInstanceOf(RpcProxyError);
    expect((err as RpcProxyError).code).toBe(-32603);
  });

  it('HTTP non ok : nœud suivant', async () => {
    const fetcher = jest.fn()
      .mockResolvedValueOnce(ok({}, 429))
      .mockResolvedValueOnce(ok({ result: '0x1' }));
    await expect(rpcProxy(['https://a', 'https://b'], 'eth_getBalance', ['0x0', 'latest'], { fetcher: fetcher as unknown as typeof fetch })).resolves.toBe('0x1');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('erreur d\'EXÉCUTION (revert) : relayée telle quelle (code, data), sans autre essai', async () => {
    const fetcher = jest.fn().mockResolvedValue(ok({ error: { code: 3, message: 'execution reverted', data: '0x08c379a0' } }));
    const err = await rpcProxy(['https://a', 'https://b'], 'eth_call', [{}], { fetcher: fetcher as unknown as typeof fetch }).catch((e) => e);
    expect(err).toMatchObject({ code: 3, message: 'execution reverted', data: '0x08c379a0' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('erreur propre au nœud (limite de débit) : le nœud suivant répond', async () => {
    const fetcher = jest.fn()
      .mockResolvedValueOnce(ok({ error: { code: -32005, message: 'rate limit' } }))
      .mockResolvedValueOnce(ok({ result: '0x10' }));
    await expect(rpcProxy(['https://a', 'https://b'], 'eth_getBalance', ['0x0', 'latest'], { fetcher: fetcher as unknown as typeof fetch })).resolves.toBe('0x10');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('erreur propre au nœud partout : la dernière est rendue', async () => {
    const fetcher = jest.fn().mockResolvedValue(ok({ error: { code: -32000, message: 'header not found' } }));
    await expect(rpcProxy(['https://a', 'https://b'], 'eth_call', [{}], { fetcher: fetcher as unknown as typeof fetch })).rejects.toMatchObject({ code: -32000 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('réponse illisible partout : -32603', async () => {
    const fetcher = jest.fn().mockResolvedValue(ok(null));
    await expect(rpcProxy(['https://a'], 'eth_call', [], { fetcher: fetcher as unknown as typeof fetch })).rejects.toMatchObject({ code: -32603 });
  });
});
