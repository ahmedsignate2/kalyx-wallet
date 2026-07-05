import { getAdapter, listChains, hasChain } from './registry';
import { EvmChainAdapter } from './EvmChainAdapter';
import { ALL_CHAINS } from './configs';

describe('intégrité du catalogue de chaînes', () => {
  it('n’a aucun `id` de chaîne en double', () => {
    const ids = ALL_CHAINS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('n’a aucun `evmChainId` EVM en double', () => {
    const chainIds = ALL_CHAINS.filter((c) => c.family === 'evm').map((c) => c.evmChainId);
    expect(chainIds.every((n) => typeof n === 'number' && n > 0)).toBe(true);
    expect(new Set(chainIds).size).toBe(chainIds.length);
  });

  it('a au moins un RPC https pour chaque chaîne', () => {
    for (const c of ALL_CHAINS) {
      expect(c.rpcUrls.length).toBeGreaterThan(0);
      expect(c.rpcUrls.every((u) => u.startsWith('https://'))).toBe(true);
    }
  });

  it('expose un adapter instanciable pour chaque chaîne du catalogue', () => {
    for (const c of ALL_CHAINS) {
      expect(getAdapter(c.id).config.id).toBe(c.id);
    }
  });
});

describe('registre de chaînes', () => {
  it('retourne un adapter pour chaque chaîne connue', () => {
    for (const id of ['ethereum', 'bnb', 'polygon', 'sepolia']) {
      const adapter = getAdapter(id);
      expect(adapter.config.id).toBe(id);
      expect(adapter).toBeInstanceOf(EvmChainAdapter);
    }
  });

  it('lève pour une chaîne inconnue', () => {
    expect(() => getAdapter('dogecoin')).toThrow(/inconnue/i);
    expect(hasChain('dogecoin')).toBe(false);
    expect(hasChain('ethereum')).toBe(true);
  });

  it('retourne le même singleton d’adapter à chaque appel', () => {
    expect(getAdapter('ethereum')).toBe(getAdapter('ethereum'));
  });

  it('listChains peut filtrer les testnets', () => {
    const withTest = listChains({ includeTestnets: true });
    const noTest = listChains({ includeTestnets: false });
    expect(withTest.some((c) => c.testnet)).toBe(true);
    expect(noTest.some((c) => c.testnet)).toBe(false);
    expect(noTest.length).toBeLessThan(withTest.length);
  });
});
