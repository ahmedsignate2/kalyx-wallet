import { getAdapter, listChains, hasChain } from './registry';
import { EvmChainAdapter } from './EvmChainAdapter';

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
