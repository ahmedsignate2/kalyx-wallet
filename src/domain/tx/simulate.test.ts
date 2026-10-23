import { isUnsupportedMethod, parseAlchemySimulation, simulateTx, staticSimulation } from './simulate';
import { ALL_CHAINS } from '../chains/configs';

const ME = '0x28C6c06298d514Db089934071355E5743bf21d60';
const eth = ALL_CHAINS.find((c) => c.id === 'ethereum')!;

describe('simulation', () => {
  it('parse Alchemy : perds / reçois du point de vue de l’utilisateur', () => {
    const json = { result: { changes: [
      { assetType: 'ERC20', changeType: 'TRANSFER', from: ME, to: '0xrouter', rawAmount: '50000000', symbol: 'USDC', decimals: 6, contractAddress: '0xa0b8' },
      { assetType: 'NATIVE', changeType: 'TRANSFER', from: '0xrouter', to: ME.toLowerCase(), rawAmount: '20000000000000000', symbol: 'ETH', decimals: 18 },
      { assetType: 'ERC20', changeType: 'APPROVE', from: ME, to: '0xrouter', rawAmount: '1' },
      { assetType: 'ERC20', changeType: 'TRANSFER', from: '0xa', to: '0xb', rawAmount: '1', symbol: 'X', decimals: 1 },
    ] } };
    const ch = parseAlchemySimulation(json, ME);
    expect(ch).toHaveLength(2);
    expect(ch[0]).toMatchObject({ direction: 'out', symbol: 'USDC', rawAmount: '50000000', decimals: 6 });
    expect(ch[1]).toMatchObject({ direction: 'in', symbol: 'ETH', rawAmount: '20000000000000000' });
  });
  it('statique : envoi natif', () => {
    const s = staticSimulation({ to: '0xabc', value: 10n ** 18n, data: '0x' }, eth);
    expect(s.changes[0]).toMatchObject({ direction: 'out', assetType: 'NATIVE', symbol: 'ETH', rawAmount: (10n ** 18n).toString() });
  });
  it('statique : approve illimité et setApprovalForAll → approvals', () => {
    const spender = '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae';
    const approve = '0x095ea7b3' + spender.slice(2).padStart(64, '0') + 'f'.repeat(64);
    expect(staticSimulation({ to: '0xtoken', data: approve }, eth).approvals[0]).toMatchObject({ spender, unlimited: true });
    const all = '0xa22cb465' + spender.slice(2).padStart(64, '0') + '1'.padStart(64, '0');
    expect(staticSimulation({ to: '0xnft', data: all }, eth).approvals[0]).toMatchObject({ spender, all: true });
  });

  it('erreur du nœud ≠ verdict sur la transaction', () => {
    expect(isUnsupportedMethod({ code: -32600, message: 'Unsupported method: alchemy_simulateAssetChanges. See available methods at https://docs.alchemy.com/' })).toBe(true);
    expect(isUnsupportedMethod({ code: -32601, message: 'x' })).toBe(true);
    expect(isUnsupportedMethod({ code: 3, message: 'execution reverted' })).toBe(false);
    expect(isUnsupportedMethod(undefined)).toBe(false);
  });

  describe('simulateTx', () => {
    const base = ALL_CHAINS.find((c) => c.id === 'base')!;
    const chain = { ...base, rpcUrls: ['https://base-mainnet.g.alchemy.com/v2/test-sim'] };
    const tx = { from: ME, to: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae', value: 10n ** 15n, data: '0x12345678' };
    const realFetch = global.fetch;
    afterEach(() => { global.fetch = realFetch; });
    const answer = (body: unknown, status = 200) => jest.fn(async () => ({ ok: status < 400, status, headers: { get: () => null }, json: async () => body })) as unknown as typeof fetch;

    it('méthode absente sur ce réseau : lecture statique, aucun message anglais, plus redemandée', async () => {
      const f = answer({ jsonrpc: '2.0', id: 1, error: { code: -32600, message: 'Unsupported method: alchemy_simulateAssetChanges. See available methods at https://docs.alchemy.com/' } });
      global.fetch = f;
      const s = await simulateTx(chain, tx);
      expect(s.source).toBe('static');
      expect(s.error).toBeUndefined();
      expect(s.changes[0]).toMatchObject({ direction: 'out', assetType: 'NATIVE' });
      await simulateTx(chain, tx);
      expect(f).toHaveBeenCalledTimes(1);
    });

    it('nœud saturé (503) : lecture statique, sans erreur', async () => {
      global.fetch = answer({}, 503);
      const s = await simulateTx({ ...chain, rpcUrls: ['https://base-mainnet.g.alchemy.com/v2/test-503'] }, tx);
      expect(s).toMatchObject({ source: 'static' });
      expect(s.error).toBeUndefined();
    });

    it('la simulation dit « échouerait » : le motif est gardé', async () => {
      global.fetch = answer({ jsonrpc: '2.0', id: 1, result: { changes: [], error: { message: 'execution reverted: insufficient balance' } } });
      const s = await simulateTx({ ...chain, rpcUrls: ['https://base-mainnet.g.alchemy.com/v2/test-revert'] }, tx);
      expect(s.error).toBe('execution reverted: insufficient balance');
    });
  });
});
