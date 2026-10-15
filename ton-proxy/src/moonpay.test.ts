// node --experimental-strip-types --test src/moonpay.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buyParams, canonicalIp, hmacBase64, queryOf, quoteQuery, signedBuyUrl, trimCurrencies, trimQuote } from './moonpay.ts';

test('signature : vecteur de test de la documentation MoonPay', async () => {
  const msg = '?apiKey=pk_test_DocsVector00&currencyCode=eth&walletAddress=0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe';
  assert.equal(await hmacBase64('sk_test_DocsVector00', msg), 'oIJxSghyzll/BLhUFdQZhkxf7DAS8REFaWr/ibO+K8Q=');
  assert.equal(
    queryOf([['apiKey', 'pk_test_DocsVector00'], ['currencyCode', 'eth'], ['walletAddress', '0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe']]),
    msg,
  );
});

test('URL signée : hôte du bac à sable, signature encodée en dernier, IP liée', async () => {
  const p = buyParams({ currencyCode: 'ETH', walletAddress: '0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe' }, 'pk_test_DocsVector00');
  assert.ok(p.ok);
  const url = await signedBuyUrl({ env: 'sandbox', params: p.ok ? p.value : [], secret: 'sk_test_DocsVector00', ipMatch: false });
  assert.equal(
    url,
    'https://buy-sandbox.moonpay.com/?apiKey=pk_test_DocsVector00&currencyCode=eth&walletAddress=0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe&signature=oIJxSghyzll%2FBLhUFdQZhkxf7DAS8REFaWr%2FibO%2BK8Q%3D',
  );
  const withIp = await signedBuyUrl({ env: 'sandbox', params: p.ok ? p.value : [], secret: 's', clientIp: '203.0.113.42', redirectURL: 'https://kalyxwallet.com/buy/complete' });
  const q = new URL(withIp).searchParams;
  assert.equal(q.get('allowedIpAddress'), await hmacBase64('s', '203.0.113.42'));
  assert.equal(q.get('redirectURL'), 'https://kalyxwallet.com/buy/complete');
  const signed = withIp.slice(withIp.indexOf('?'), withIp.lastIndexOf('&signature='));
  assert.equal(q.get('signature'), await hmacBase64('s', signed));
});

test('pas un signeur ouvert : seuls les paramètres connus et valides passent', () => {
  const k = 'pk_test_x';
  const ok = { currencyCode: 'usdc_base', walletAddress: '0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe' };
  assert.equal(buyParams({ ...ok, baseCurrencyCode: 'EUR', baseCurrencyAmount: '50', paymentMethod: 'apple_pay', theme: 'dark' }, k).ok, true);
  for (const bad of [
    { ...ok, currencyCode: 'eth&walletAddress=x' },
    { ...ok, walletAddress: 'abc' },
    { ...ok, walletAddress: '0x<script>alert(1)</script>000000000000000' },
    { ...ok, baseCurrencyAmount: '50' }, // sans devise
    { ...ok, baseCurrencyCode: 'eur', baseCurrencyAmount: -1 },
    { ...ok, paymentMethod: 'crypto_magic' },
    { ...ok, email: 'pas un email' },
    null,
  ]) assert.equal(buyParams(bad, k).ok, false, JSON.stringify(bad));
  // Les paramètres inconnus (commission, autre clé…) sont ignorés, jamais relayés.
  const p = buyParams({ ...ok, apiKey: 'pk_live_evil', extraFee: 5, redirectURL: 'https://evil' }, k);
  assert.ok(p.ok && p.value.every(([key]) => ['apiKey', 'currencyCode', 'walletAddress'].includes(key)) && p.value[0][1] === k);
});

test('IP canonique (RFC 5952, IPv4 mappée, ports)', () => {
  assert.equal(canonicalIp('203.0.113.42'), '203.0.113.42');
  assert.equal(canonicalIp('203.000.113.042'), '203.0.113.42');
  assert.equal(canonicalIp('203.0.113.42:443'), '203.0.113.42');
  assert.equal(canonicalIp('2001:0DB8:0000:0000:0000:0000:0000:0001'), '2001:db8::1');
  assert.equal(canonicalIp('[2001:db8::1]:443'), '2001:db8::1');
  assert.equal(canonicalIp('::ffff:203.0.113.42'), '203.0.113.42');
  assert.equal(canonicalIp('2001:db8:0:0:1:0:0:1'), '2001:db8::1:0:0:1');
  assert.equal(canonicalIp('2001:db8:1:1:1:1:1:1'), '2001:db8:1:1:1:1:1:1');
  assert.equal(canonicalIp('::1'), '::1');
  for (const bad of ['', 'abc', '1.2.3', '256.1.1.1', '1::2::3', 'g::1']) assert.equal(canonicalIp(bad), null, bad);
});

test('devis et devises : champs utiles seulement, validés', () => {
  assert.equal(quoteQuery(new URLSearchParams('currencyCode=eth&baseCurrencyCode=eur&baseCurrencyAmount=50'), 'pk')?.code, 'eth');
  assert.equal(quoteQuery(new URLSearchParams('currencyCode=eth&baseCurrencyCode=eur&baseCurrencyAmount=-5'), 'pk'), null);
  assert.equal(quoteQuery(new URLSearchParams('currencyCode=../x&baseCurrencyCode=eur&baseCurrencyAmount=5'), 'pk'), null);
  assert.deepEqual(trimQuote({ quoteCurrencyAmount: 0.01, baseCurrencyAmount: 45, feeAmount: 3.99, networkFeeAmount: 1, totalAmount: 50, secret: 'x' }), {
    quoteCurrencyAmount: 0.01, baseCurrencyAmount: 45, feeAmount: 3.99, networkFeeAmount: 1, extraFeeAmount: 0, totalAmount: 50,
  });
  assert.equal(trimQuote({ quoteCurrencyAmount: 'x' }), null);
  const c = trimCurrencies([
    { type: 'crypto', code: 'usdc_base', name: 'USD Coin (Base)', minBuyAmount: 20, maxBuyAmount: 10000, supportsTestMode: true, metadata: { networkCode: 'base', chainId: '8453', contractAddress: '0x83' } },
    { type: 'fiat', code: 'eur', name: 'Euro', minBuyAmount: 20, maxBuyAmount: 30000 },
    { type: 'nft', code: 'x' },
  ]);
  assert.equal(c.length, 2);
  assert.equal(c[0].networkCode, 'base');
});
