const mockStorage: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockStorage[k] ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockStorage[k] = v;
  }),
}));
let mockDecoy = false;
jest.mock('./sessionMode', () => ({ isDecoySession: () => mockDecoy, onDecoyChange: () => () => {} }));

const KEY = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345';
const CHAIN = {
  id: 'ethereum',
  family: 'evm',
  testnet: false,
  rpcUrls: [`https://eth-mainnet.g.alchemy.com/v2/${KEY}`, 'https://eth.publicnode.com', 'https://eth.drpc.org'],
};
jest.mock('../src/domain/chains/registry', () => ({
  hasChain: (id: string) => id === 'ethereum',
  getAdapter: () => ({ config: CHAIN }),
}));

import { useRpcOverrides, displayRpcUrl, counterpartChain, TESTNET_OF, MAINNET_OF, applyPins, healthKeyOf } from './rpcOverridesStore';
import { tryInOrder, resetRpcHealth, resetRpcPins, rpcHealthSnapshot } from '../src/domain/chains/net';

/** Ordre dans lequel `tryInOrder` essaie réellement les RPC (comme EvmChainAdapter). */
async function triedOrder(): Promise<string[]> {
  const tried: string[] = [];
  await expect(
    tryInOrder(CHAIN.rpcUrls, async (u) => {
      tried.push(u);
      throw new Error('503 service unavailable');
    }, { timeoutMs: 50, key: 'evm:ethereum' }),
  ).rejects.toBeTruthy();
  return tried;
}

describe('RPC épinglés', () => {
  beforeEach(() => {
    resetRpcHealth();
    resetRpcPins();
    mockDecoy = false;
    for (const k of Object.keys(mockStorage)) delete mockStorage[k];
    useRpcOverrides.setState({ pins: {}, loaded: false });
  });

  it("l'URL épinglée passe en tête de l'ordre d'essai réel", async () => {
    expect(await triedOrder()).toEqual(CHAIN.rpcUrls);
    resetRpcHealth();
    useRpcOverrides.getState().pin('ethereum', CHAIN.rpcUrls[2]);
    expect(await triedOrder()).toEqual([CHAIN.rpcUrls[2], CHAIN.rpcUrls[0], CHAIN.rpcUrls[1]]);
    expect(rpcHealthSnapshot('evm:ethereum', 3)[2]).toMatchObject({ pinned: true });
    resetRpcHealth();
    useRpcOverrides.getState().unpin('ethereum');
    expect(await triedOrder()).toEqual(CHAIN.rpcUrls);
  });

  it("un RPC épinglé en panne ne passe pas devant (santé inchangée)", async () => {
    useRpcOverrides.getState().pin('ethereum', CHAIN.rpcUrls[1]);
    await triedOrder(); // tous en panne → tous en pénalité
    const snap = rpcHealthSnapshot('evm:ethereum', 3);
    expect(snap.every((s) => s.state === 'failed')).toBe(true);
    let tried = 0;
    await tryInOrder(CHAIN.rpcUrls, async (u) => {
      tried++;
      return u;
    }, { timeoutMs: 50, key: 'evm:ethereum' });
    expect(tried).toBe(1);
  });

  it('aucune clé d’API persistée ; rechargé, l’épingle est retrouvée par sa forme masquée', async () => {
    useRpcOverrides.getState().pin('ethereum', CHAIN.rpcUrls[0]);
    const disk = mockStorage['kalyx.rpcOverrides.v1'];
    expect(disk).toBeDefined();
    expect(disk).not.toContain(KEY);
    resetRpcPins();
    useRpcOverrides.setState({ pins: {}, loaded: false });
    await useRpcOverrides.getState().load();
    expect(useRpcOverrides.getState().pins.ethereum).toBe(displayRpcUrl(CHAIN.rpcUrls[0]));
    resetRpcHealth();
    expect((await triedOrder())[0]).toBe(CHAIN.rpcUrls[0]);
  });

  it('une URL brute glissée sur le disque est refusée au chargement', async () => {
    mockStorage['kalyx.rpcOverrides.v1'] = JSON.stringify({ ethereum: CHAIN.rpcUrls[0] });
    await useRpcOverrides.getState().load();
    expect(useRpcOverrides.getState().pins).toEqual({});
  });

  it('session leurre : rien écrit', () => {
    mockDecoy = true;
    useRpcOverrides.getState().pin('ethereum', CHAIN.rpcUrls[1]);
    expect(mockStorage['kalyx.rpcOverrides.v1']).toBeUndefined();
  });

  it('affichage : clés et paramètres masqués', () => {
    expect(displayRpcUrl(`https://mainnet.infura.io/v3/0123456789abcdef0123456789abcdef`)).toBe('https://mainnet.infura.io/v3/[…]');
    expect(displayRpcUrl(`https://rpc.io/x?apikey=${KEY}`)).not.toContain(KEY);
    expect(displayRpcUrl(`https://u:p@rpc.io/`)).not.toContain('u:p');
  });

  it('clé de santé alignée sur les adaptateurs ; URL disparue = épingle ignorée', () => {
    expect(healthKeyOf({ id: 'solana', family: 'solana' })).toBe('sol:solana');
    expect(healthKeyOf({ id: 'bitcoin', family: 'bitcoin' })).toBe('btc:bitcoin');
    expect(healthKeyOf({ id: 'ton', family: 'ton' })).toBeNull();
    applyPins({ ethereum: 'https://disparu.io/' });
    expect(rpcHealthSnapshot('evm:ethereum', 3).some((s) => s.pinned)).toBe(false);
  });
});

describe('Bascule Mainnet ↔ Testnets', () => {
  const known = new Set(['ethereum', 'sepolia', 'base', 'base-sepolia', 'solana', 'solana-devnet', 'ton', 'ton-testnet', 'monad-testnet', 'bitcoin', 'arbitrum']);
  const testnets = new Set(['sepolia', 'base-sepolia', 'solana-devnet', 'ton-testnet', 'monad-testnet']);
  const opts = { exists: (id: string) => known.has(id), isTestnet: (id: string) => testnets.has(id), fallbackMainnet: 'ethereum', fallbackTestnet: 'sepolia' };

  it.each([
    ['ethereum', 'sepolia'],
    ['base', 'base-sepolia'],
    ['solana', 'solana-devnet'],
    ['ton', 'ton-testnet'],
  ])('%s ↔ %s', (main, test) => {
    expect(counterpartChain(main, true, opts)).toBe(test);
    expect(counterpartChain(test, false, opts)).toBe(main);
  });

  it('table réciproque', () => {
    for (const [m, t] of Object.entries(TESTNET_OF)) expect(MAINNET_OF[t]).toBe(m);
  });

  it('replis : sans équivalent → Sepolia en test, DEFAULT_CHAIN en mainnet ; déjà du bon côté → inchangé', () => {
    expect(counterpartChain('arbitrum', true, opts)).toBe('sepolia');
    expect(counterpartChain('monad-testnet', false, opts)).toBe('ethereum'); // pas de Monad mainnet configuré
    expect(counterpartChain('arbitrum', false, opts)).toBe('arbitrum');
    expect(counterpartChain('solana-devnet', true, opts)).toBe('solana-devnet');
    expect(counterpartChain('inconnu', false, opts)).toBe('ethereum');
  });
});
