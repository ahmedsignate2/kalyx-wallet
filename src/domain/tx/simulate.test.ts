import { decodeAbiString, isUnsupportedMethod, parseAlchemySimulation, parseSimulateV1, resetSimulators, simulateTx, simulatedChanges, staticSimulation } from './simulate';
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

  describe('eth_simulateV1 (journaux de transfert)', () => {
    const T = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
    const pad = (a: string) => '0x' + a.slice(2).toLowerCase().padStart(64, '0');
    const amt = (n: bigint) => '0x' + n.toString(16).padStart(64, '0');
    const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
    const POOL = '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640';

    it('natif (adresse 0xeeee…), ERC-20 et NFT, du point de vue de l’utilisateur ; deux sauts d’une route = une ligne', () => {
      const json = { result: [{ calls: [{ status: '0x1', logs: [
        { address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', topics: [T, pad(ME), pad(POOL)], data: amt(10n ** 16n) },
        { address: USDC, topics: [T, pad(POOL), pad(ME)], data: amt(20_000_000n) },
        { address: USDC, topics: [T, pad(POOL), pad(ME)], data: amt(5_000_000n) },
        { address: '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d', topics: [T, pad(POOL), pad(ME), amt(42n)], data: '0x' },
        { address: USDC, topics: [T, pad(POOL), pad('0x1111111111111111111111111111111111111111')], data: amt(1n) },
      ] }] }] };
      const r = parseSimulateV1(json, ME);
      expect(r && 'moves' in r && r.moves).toEqual([
        { direction: 'out', kind: 'NATIVE', contract: undefined, amount: 10n ** 16n, tokenId: undefined, counterparty: POOL.toLowerCase() },
        { direction: 'in', kind: 'ERC20', contract: USDC.toLowerCase(), amount: 25_000_000n, tokenId: undefined, counterparty: POOL.toLowerCase() },
        { direction: 'in', kind: 'ERC721', contract: '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d', amount: 1n, tokenId: '42', counterparty: POOL.toLowerCase() },
      ]);
    });

    it('échec : le message du nœud ; réponse sans appel : rien (pas un verdict)', () => {
      expect(parseSimulateV1({ result: [{ calls: [{ status: '0x0', error: { message: 'execution reverted: STF' } }] }] }, ME)).toEqual({ reverted: 'execution reverted: STF' });
      expect(parseSimulateV1({ result: [] }, ME)).toBeNull();
    });

    it('symbole : chaîne ABI ou bytes32, nettoyé', () => {
      const str = '0x' + '20'.padStart(64, '0') + '4'.padStart(64, '0') + Buffer.from('USDC').toString('hex').padEnd(64, '0');
      expect(decodeAbiString(str)).toBe('USDC');
      expect(decodeAbiString('0x' + Buffer.from('MKR').toString('hex').padEnd(64, '0'))).toBe('MKR');
      expect(decodeAbiString('0x')).toBeNull();
    });
  });

  describe('simulateTx', () => {
    const base = ALL_CHAINS.find((c) => c.id === 'base')!;
    const tx = { from: ME, to: '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae', value: 10n ** 15n, data: '0x12345678' };
    const realFetch = global.fetch;
    beforeEach(() => resetSimulators());
    afterEach(() => { global.fetch = realFetch; });
    const UNSUPPORTED = { code: -32601, message: 'the method does not exist/is not available' };
    /** Nœud simulé : une réponse par méthode ; compte les appels par méthode. */
    const node = (byMethod: Record<string, (params: unknown[]) => unknown>, status = 200) => {
      const calls: Record<string, number> = {};
      const f = jest.fn(async (_url: string, init: { body: string }) => {
        const req = JSON.parse(init.body);
        const one = (r: { id: number; method: string; params: unknown[] }) => {
          calls[r.method] = (calls[r.method] ?? 0) + 1;
          const h = byMethod[r.method];
          return { jsonrpc: '2.0', id: r.id, ...(h ? (h(r.params) as object) : { error: UNSUPPORTED }) };
        };
        const body = Array.isArray(req) ? req.map(one) : one(req);
        return { ok: status < 400, status, headers: { get: () => null }, json: async () => body };
      });
      global.fetch = f as unknown as typeof fetch;
      return calls;
    };

    it('aucun nœud ne simule ni ne répond : lecture statique, sans message, méthodes plus redemandées', async () => {
      const chain = { ...base, rpcUrls: ['https://base-mainnet.g.alchemy.com/v2/test-sim'] };
      const calls = node({ eth_call: () => ({ error: { code: -32005, message: 'limit exceeded' } }) });
      const s = await simulateTx(chain, tx);
      expect(s.source).toBe('static');
      expect(s.error).toBeUndefined();
      expect(s.changes[0]).toMatchObject({ direction: 'out', assetType: 'NATIVE' });
      await simulateTx(chain, tx);
      expect(calls.alchemy_simulateAssetChanges).toBe(1);
      expect(calls.eth_simulateV1).toBe(1);
    });

    it('nœud saturé (503) : lecture statique, sans erreur', async () => {
      node({}, 503);
      const s = await simulateTx({ ...base, rpcUrls: ['https://base-mainnet.g.alchemy.com/v2/test-503'] }, tx);
      expect(s).toMatchObject({ source: 'static' });
      expect(s.error).toBeUndefined();
    });

    it('Alchemy dit « échouerait » : le motif est gardé', async () => {
      node({ alchemy_simulateAssetChanges: () => ({ result: { changes: [], error: { message: 'execution reverted: insufficient balance' } } }) });
      const s = await simulateTx({ ...base, rpcUrls: ['https://base-mainnet.g.alchemy.com/v2/test-revert'] }, tx);
      expect(s.error).toBe('execution reverted: insufficient balance');
    });

    it('réseau sans Alchemy : eth_simulateV1 donne les mouvements, symboles lus sur le contrat', async () => {
      const T = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
      const pad = (a: string) => '0x' + a.slice(2).toLowerCase().padStart(64, '0');
      const TOKEN = '0x4200000000000000000000000000000000000006';
      const sym = '0x' + '20'.padStart(64, '0') + '4'.padStart(64, '0') + Buffer.from('WETH').toString('hex').padEnd(64, '0');
      node({
        eth_simulateV1: () => ({ result: [{ calls: [{ status: '0x1', logs: [
          { address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', topics: [T, pad(ME), pad(tx.to)], data: '0x' + (10n ** 15n).toString(16).padStart(64, '0') },
          { address: TOKEN, topics: [T, pad(tx.to), pad(ME)], data: '0x' + (10n ** 15n).toString(16).padStart(64, '0') },
        ] }] }] }),
        eth_call: (p) => ({ result: (p[0] as { data: string }).data === '0x95d89b41' ? sym : '0x' + '12'.padStart(64, '0') }),
      });
      const s = await simulateTx({ ...base, rpcUrls: ['https://base-rpc.publicnode.com'] }, tx);
      expect(s.source).toBe('node');
      expect(simulatedChanges(s)).toBe(true);
      expect(s.changes).toEqual([
        expect.objectContaining({ direction: 'out', assetType: 'NATIVE', symbol: 'ETH', rawAmount: (10n ** 15n).toString() }),
        expect.objectContaining({ direction: 'in', assetType: 'ERC20', symbol: 'WETH', decimals: 18, rawAmount: (10n ** 15n).toString() }),
      ]);
    });

    it('relais Alchemy rangé en dernier : essayé en tête pour eth_simulateV1 ; un refus du relais est mémorisé', async () => {
      const RELAY = 'https://relay.example/rpc/alchemy/base-mainnet';
      const urls = ['https://a.example', 'https://b.example', 'https://c.example', RELAY];
      const v1Calls: string[] = [];
      let relayAllows = true;
      global.fetch = jest.fn(async (url: string, init: { body: string }) => {
        const r = JSON.parse(init.body);
        if (r.method === 'eth_simulateV1') v1Calls.push(url);
        if (url === RELAY && r.method === 'eth_simulateV1' && !relayAllows) return { ok: false, status: 400, headers: { get: () => null }, json: async () => ({ error: 'method not allowed' }) };
        if (url === RELAY && r.method === 'eth_simulateV1') return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ jsonrpc: '2.0', id: r.id, result: [{ calls: [{ status: '0x1', logs: [] }] }] }) };
        return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ jsonrpc: '2.0', id: r.id, error: UNSUPPORTED }) };
      }) as unknown as typeof fetch;
      const chain = { ...base, rpcUrls: urls };
      const s = await simulateTx(chain, tx);
      expect(v1Calls[0]).toBe(RELAY);
      expect(s.source).toBe('node');
      // Relais pas encore à jour (méthode refusée) : plus redemandé ensuite.
      resetSimulators();
      relayAllows = false;
      v1Calls.length = 0;
      await simulateTx(chain, tx);
      await simulateTx(chain, tx);
      expect(v1Calls.filter((u) => u === RELAY)).toHaveLength(1);
    });

    it('jeton illisible : montant inconnu (« ? »), jamais un nombre brut', async () => {
      const T = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
      const pad = (a: string) => '0x' + a.slice(2).toLowerCase().padStart(64, '0');
      node({
        eth_simulateV1: () => ({ result: [{ calls: [{ status: '0x1', logs: [{ address: '0x9999999999999999999999999999999999999999', topics: [T, pad(tx.to), pad(ME)], data: '0x' + '1'.padStart(64, '0') }] }] }] }),
        eth_call: () => ({ error: { code: 3, message: 'execution reverted' } }),
      });
      const s = await simulateTx({ ...base, rpcUrls: ['https://base-rpc.publicnode.com'] }, tx);
      expect(s.changes[0]).toMatchObject({ direction: 'in', assetType: 'UNKNOWN', rawAmount: '?' });
    });

    it('aucun simulateur : eth_call dit que ça passerait (aperçu partiel), ou que ça échouerait', async () => {
      node({ eth_call: () => ({ result: '0x' }) });
      expect((await simulateTx({ ...base, rpcUrls: ['https://base-rpc.publicnode.com'] }, tx)).source).toBe('call');
      resetSimulators();
      node({ eth_call: () => ({ error: { code: 3, message: 'execution reverted: Too little received' } }) });
      const r = await simulateTx({ ...base, rpcUrls: ['https://base-rpc.publicnode.com'] }, tx);
      expect(r.error).toBe('execution reverted: Too little received');
      expect(simulatedChanges(r)).toBe(false);
    });
  });
});
