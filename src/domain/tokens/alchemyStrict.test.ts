jest.mock('../chains/configs', () => ({ ...jest.requireActual('../chains/configs'), ALCHEMY_KEY: 'k' }));
import { getErc20Tokens, getErc20TokensStrict } from './alchemyTokens';

const chain = { id: 'base', name: 'Base', family: 'evm', evmChainId: 8453, nativeSymbol: 'ETH', nativeDecimals: 18, rpcUrls: ['https://base-mainnet.g.alchemy.com/v2/k'] } as never;

describe('Alchemy refuse : « lecture impossible », pas « aucun jeton »', () => {
  afterEach(() => { (global as any).fetch = undefined; });

  it('HTTP 429 → la variante stricte lève, la variante historique rend []', async () => {
    (global as any).fetch = async () => ({ ok: false, status: 429, json: async () => ({ error: { code: 429 } }) });
    await expect(getErc20TokensStrict(chain, '0x' + '1'.repeat(40))).rejects.toThrow(/429/);
    await expect(getErc20Tokens(chain, '0x' + '1'.repeat(40))).resolves.toEqual([]);
  });

  it('erreur JSON-RPC dans une réponse 200 → lève aussi', async () => {
    (global as any).fetch = async () => ({ ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, error: { code: -32600, message: 'capacity limit' } }) });
    await expect(getErc20TokensStrict(chain, '0x' + '1'.repeat(40))).rejects.toThrow(/refusé/);
  });

  it('réponse vide mais valide → [] sans lever (vraiment aucun jeton)', async () => {
    (global as any).fetch = async () => ({ ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, result: { tokenBalances: [] } }) });
    await expect(getErc20TokensStrict(chain, '0x' + '1'.repeat(40))).resolves.toEqual([]);
  });
});
