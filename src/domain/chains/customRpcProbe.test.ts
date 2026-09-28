import { probeRpcChainId } from './customNetworks';

const rpc = (result: unknown) => (async () => ({ json: async () => ({ jsonrpc: '2.0', id: 1, result }) })) as unknown as typeof fetch;

it('lit le Chain ID réel du RPC', async () => {
  expect(await probeRpcChainId('https://x', rpc('0x2105'))).toBe(8453);
  expect(await probeRpcChainId('https://x', rpc('0x1'))).toBe(1);
});

it('RPC muet ou réponse absurde : null (l’ajout est refusé)', async () => {
  expect(await probeRpcChainId('https://x', (async () => { throw new Error('down'); }) as never)).toBeNull();
  expect(await probeRpcChainId('https://x', rpc(null))).toBeNull();
  expect(await probeRpcChainId('https://x', rpc('0x0'))).toBeNull();
});
