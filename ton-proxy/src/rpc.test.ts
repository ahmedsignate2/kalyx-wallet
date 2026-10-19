// node --experimental-strip-types --test src/rpc.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { balancesBatch, extensionAllowed, joinTokens, nonZeroContracts, parseErc20Request, quotaPause, resolveRpc, sanitizeRpc, upstreamUrl } from './rpc.ts';

const ADDR = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';

test('routes : réseaux connus seulement, POST seulement', () => {
  assert.deepEqual(resolveRpc('POST', '/rpc/alchemy/base-mainnet'), { ok: true, provider: 'alchemy', slug: 'base-mainnet' });
  assert.equal(resolveRpc('POST', '/rpc/helius').ok, true);
  assert.equal(resolveRpc('POST', '/rpc/alchemy/solana-mainnet').ok, false);
  assert.equal(resolveRpc('POST', '/rpc/alchemy/../v2').ok, false);
  assert.equal(resolveRpc('GET', '/rpc/alchemy/eth-mainnet').ok, false);
});

test('liste blanche des méthodes, re-sérialisation, lots bornés', () => {
  const ok = sanitizeRpc('alchemy', JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [ADDR, 'latest'], extra: 'x' }));
  assert.equal(ok.ok, true);
  assert.ok(ok.ok && !ok.body.includes('extra'));
  assert.equal(sanitizeRpc('alchemy', JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getLogs', params: [] })).ok, false);
  assert.equal(sanitizeRpc('alchemy', JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'debug_traceTransaction', params: [] })).ok, false);
  assert.equal(sanitizeRpc('helius', JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [] })).ok, false);
  assert.equal(sanitizeRpc('helius', JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: ['x'] })).ok, true);
  const big = Array.from({ length: 26 }, (_, i) => ({ jsonrpc: '2.0', id: i, method: 'eth_chainId' }));
  assert.equal(sanitizeRpc('alchemy', JSON.stringify(big)).ok, false);
  assert.equal(sanitizeRpc('alchemy', 'x'.repeat(40_000)).ok, false);
  assert.equal(sanitizeRpc('alchemy', 'pas du json').ok, false);
});

test('cache : métadonnées oui, soldes et diffusions non', () => {
  const meta = sanitizeRpc('alchemy', JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'alchemy_getTokenMetadata', params: [ADDR] }));
  assert.ok(meta.ok && meta.cacheSeconds === 86_400);
  const mixed = sanitizeRpc('alchemy', JSON.stringify([{ jsonrpc: '2.0', id: 1, method: 'alchemy_getTokenMetadata', params: [ADDR] }, { jsonrpc: '2.0', id: 2, method: 'eth_getBalance', params: [ADDR, 'latest'] }]));
  assert.ok(mixed.ok && mixed.cacheSeconds === 0);
  const send = sanitizeRpc('alchemy', JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_sendRawTransaction', params: ['0x00'] }));
  assert.ok(send.ok && send.write && send.cacheSeconds === 0);
});

test('la clé ne sort que vers le fournisseur', () => {
  assert.equal(upstreamUrl('alchemy', 'eth-mainnet', {}), null);
  assert.equal(upstreamUrl('alchemy', 'eth-mainnet', { alchemy: 'K' }), 'https://eth-mainnet.g.alchemy.com/v2/K');
  assert.equal(upstreamUrl('helius', 'solana-mainnet', { helius: 'H' }), 'https://mainnet.helius-rpc.com/?api-key=H');
});

test('quota : capacité mensuelle (longue pause), débit (courte), le reste non', () => {
  assert.equal(quotaPause(429, '{"error":{"code":429,"message":"Monthly capacity limit exceeded"}}'), 3_600);
  assert.equal(quotaPause(429, 'Too Many Requests'), 60);
  assert.equal(quotaPause(400, '{"error":{"message":"invalid params"}}'), 0);
  assert.equal(quotaPause(500, 'boom'), 0);
});

test('requête ERC-20 : adresse et réseaux validés', () => {
  const ok = parseErc20Request(JSON.stringify({ address: ADDR, chains: ['base-mainnet', 'eth-mainnet', 'base-mainnet'] }));
  assert.deepEqual(ok, { ok: true, address: ADDR.toLowerCase(), slugs: ['base-mainnet', 'eth-mainnet'] });
  assert.equal(parseErc20Request(JSON.stringify({ address: '0x12', chains: ['eth-mainnet'] })).ok, false);
  assert.equal(parseErc20Request(JSON.stringify({ address: ADDR, chains: ['nope'] })).ok, false);
  assert.equal(parseErc20Request(JSON.stringify({ address: ADDR, chains: [] })).ok, false);
});

test('soldes : un seul lot amont, tokens connus inclus', () => {
  const b = JSON.parse(balancesBatch('base-mainnet', ADDR));
  assert.equal(b.length, 2);
  assert.deepEqual(b[0].params, [ADDR, 'erc20']);
  assert.ok(Array.isArray(b[1].params[1]) && b[1].params[1].length > 0);
});

test('assemblage : zéros et doublons écartés, métadonnées illisibles écartées', () => {
  const reply = [
    { id: 0, result: { tokenBalances: [{ contractAddress: '0xAA', tokenBalance: '0x0' }, { contractAddress: '0xBB', tokenBalance: '0x10' }] } },
    { id: 1, result: { tokenBalances: [{ contractAddress: '0xbb', tokenBalance: '0x10' }, { contractAddress: '0xCC', tokenBalance: '0x01' }] } },
  ];
  const bal = nonZeroContracts(reply);
  assert.deepEqual(bal.map((x) => x.contract), ['0xbb', '0xcc']);
  assert.equal(bal[0].raw, '16');
  const tokens = joinTokens(bal, [
    { id: 0, result: { name: 'USD Coin', symbol: 'USDC', decimals: 6, logo: 'https://x/y.png' } },
    { id: 1, result: { name: 'X', symbol: '', decimals: 18 } },
  ]);
  assert.deepEqual(tokens, [{ contract: '0xbb', raw: '16', name: 'USD Coin', symbol: 'USDC', decimals: 6, logo: 'https://x/y.png' }]);
});

test('extensions : identifiant listé ou « * » (bêta)', () => {
  const id = 'abcdefghijklmnopabcdefghijklmnop';
  assert.equal(extensionAllowed(`chrome-extension://${id}`, '*'), true);
  assert.equal(extensionAllowed(`chrome-extension://${id}`, id), true);
  assert.equal(extensionAllowed(`chrome-extension://${id}`, ''), false);
  assert.equal(extensionAllowed('https://evil.example', '*'), false);
});

test('contrôle du réseau : eth_chainId doit correspondre', async () => {
  const { chainIdMatches, ALCHEMY_SLUGS } = await import('./rpc.ts');
  assert.equal(chainIdMatches('base-mainnet', { result: '0x2105' }), true);
  assert.equal(chainIdMatches('base-mainnet', { result: '0x1' }), false);
  assert.equal(chainIdMatches('hyperliquid-mainnet', { result: '0x3e7' }), true);
  assert.equal(chainIdMatches('base-mainnet', { error: { message: 'x' } }), false);
  assert.equal(chainIdMatches('inconnu', { result: '0x1' }), false);
  assert.equal(ALCHEMY_SLUGS['blast-mainnet'], undefined);
});
