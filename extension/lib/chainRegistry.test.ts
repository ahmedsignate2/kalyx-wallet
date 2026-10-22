import { describe, expect, test, vi } from 'vitest';

describe('réseaux de l’extension', () => {
  test('Solana : le relais d’abord, nœuds publics en secours ; Degen masqué', async () => {
    vi.resetModules();
    vi.stubEnv('EXPO_PUBLIC_KALYX_RELAY_URL', 'https://relais.exemple');
    try {
      const { listChains, hasChain } = await import('./chainRegistry');
      const sol = listChains().find((c) => c.id === 'solana')!;
      expect(sol.rpcUrls[0]).toBe('https://relais.exemple/rpc/helius');
      expect(sol.rpcUrls.slice(1).length).toBeGreaterThan(0);
      expect(sol.rpcUrls.slice(1).every((u) => !u.startsWith('https://relais.exemple'))).toBe(true);
      expect(listChains().some((c) => c.id === 'degen')).toBe(false);
      expect(hasChain('degen')).toBe(false);
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
