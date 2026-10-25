import { describe, expect, test, vi } from 'vitest';
import { makeDappHost } from './dappHost';

/** Port factice : ce que le service worker reçoit d'un script de contenu. */
function fakePort(origin: string, tabId = 7) {
  const listeners: ((m: unknown) => void)[] = [];
  const sent: unknown[] = [];
  const port = {
    name: 'kalyx-dapp',
    sender: { origin, url: `${origin}/`, frameId: 0, tab: { id: tabId } },
    onMessage: { addListener: (f: (m: unknown) => void) => listeners.push(f) },
    onDisconnect: { addListener: () => {} },
    postMessage: (m: unknown) => sent.push(m),
    disconnect: vi.fn(),
  };
  return { port, sent, send: async (m: unknown) => { for (const f of listeners) await f(m); } };
}

describe('origine d’une demande de site', () => {
  const dapp = { handle: vi.fn(async () => ['0xabc']), hello: vi.fn(async () => null) };

  test('page changée sous le port (iOS) : la demande est refusée, jamais attribuée à l’ancien site', async () => {
    const host = makeDappHost(() => dapp as never, () => {}, async () => 'https://app.uniswap.org/swap');
    const p = fakePort('https://www.google.com');
    host.accept(p.port as never);
    await p.send({ id: 1, family: 'evm', method: 'eth_requestAccounts', params: [], at: 'https://app.uniswap.org' });
    expect(dapp.handle).not.toHaveBeenCalled();
    expect(p.sent).toEqual([{ id: 1, error: { code: 4100, message: 'Page changée : réessaie' } }]);
    expect(p.port.disconnect).toHaveBeenCalled();
  });

  test('l’onglet affiche un autre site que le port : refusée aussi', async () => {
    const host = makeDappHost(() => dapp as never, () => {}, async () => 'https://app.uniswap.org/');
    const p = fakePort('https://www.google.com');
    host.accept(p.port as never);
    await p.send({ id: 2, family: 'evm', method: 'eth_requestAccounts', params: [] });
    expect(dapp.handle).not.toHaveBeenCalled();
  });

  test('même site : traitée normalement', async () => {
    const host = makeDappHost(() => dapp as never, () => {}, async () => 'https://app.uniswap.org/swap');
    const p = fakePort('https://app.uniswap.org');
    host.accept(p.port as never);
    await p.send({ id: 3, family: 'evm', method: 'eth_requestAccounts', params: [], at: 'https://app.uniswap.org' });
    expect(dapp.handle).toHaveBeenCalledWith('https://app.uniswap.org', 'evm', 'eth_requestAccounts', []);
  });
});
