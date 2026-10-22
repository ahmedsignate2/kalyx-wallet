// node --experimental-strip-types --test src/stripe.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formBody, isSessionId, keyMode, sessionForm, stripeError, trimSession } from './stripe.ts';

const EVM = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';
const SOL = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';

test('mode suivi de la clé : test ou réel, rien d’autre', () => {
  assert.equal(keyMode('sk_test_51AbCdEfGhIjKlMn'), 'test');
  assert.equal(keyMode('rk_live_51AbCdEfGhIjKlMn'), 'live');
  assert.equal(keyMode('pk_test_51AbCdEfGhIjKlMn'), null);
  assert.equal(keyMode(''), null);
  assert.equal(keyMode(undefined), null);
});

test('formulaire : adresse, réseau et crypto verrouillés, montant arrondi, IP transmise', () => {
  const f = sessionForm({ network: 'base', currency: 'USDC', address: EVM, sourceCurrency: 'EUR', sourceAmount: '25.456' }, '203.0.113.7');
  assert.ok(f.ok);
  assert.deepEqual(f.value, [
    ['wallet_addresses[base]', EVM],
    ['destination_networks[]', 'base'],
    ['destination_network', 'base'],
    ['destination_currencies[]', 'usdc'],
    ['destination_currency', 'usdc'],
    ['source_currency', 'eur'],
    ['source_amount', '25.46'],
    ['customer_ip_address', '203.0.113.7'],
  ]);
  assert.equal(formBody([['wallet_addresses[base]', EVM]]), `wallet_addresses%5Bbase%5D=${EVM}`);
  const sol = sessionForm({ network: 'solana', currency: 'sol', address: SOL }, null);
  assert.ok(sol.ok && !sol.value.some(([k]) => k === 'customer_ip_address' || k === 'source_amount'));
});

test('mode test : toujours en USD (les données de test de Stripe sont américaines)', () => {
  const f = sessionForm({ network: 'solana', currency: 'sol', address: SOL, sourceCurrency: 'eur', sourceAmount: 10 }, null, 'test');
  assert.ok(f.ok);
  assert.deepEqual(f.value.filter(([k]) => k.startsWith('source_')), [['source_currency', 'usd'], ['source_amount', '10.00']]);
  const g = sessionForm({ network: 'solana', currency: 'sol', address: SOL }, null, 'test');
  assert.ok(g.ok && g.value.some(([k, v]) => k === 'source_currency' && v === 'usd'));
});

test('formulaire : tout ce qui n’est pas attendu est refusé', () => {
  const bad = (x: unknown) => assert.equal(sessionForm(x, null).ok, false, JSON.stringify(x));
  bad(null);
  bad({ network: 'tron', currency: 'usdt', address: EVM });
  bad({ network: 'ethereum', currency: 'eth', address: SOL });
  bad({ network: 'solana', currency: 'sol', address: EVM });
  bad({ network: 'ethereum', currency: 'eth&x=1', address: EVM });
  bad({ network: 'ethereum', currency: 'eth', address: EVM, sourceCurrency: 'jpy' });
  bad({ network: 'ethereum', currency: 'eth', address: EVM, sourceAmount: 10 });
  bad({ network: 'ethereum', currency: 'eth', address: EVM, sourceCurrency: 'usd', sourceAmount: -1 });
  bad({ network: 'ethereum', currency: 'eth', address: EVM, sourceCurrency: 'usd', sourceAmount: 1e9 });
  bad({ network: '__proto__', currency: 'eth', address: EVM });
});

test('session : réduite, lien hébergé Stripe seulement', () => {
  const raw = {
    id: 'cos_0MYfrA589O8KAxCGEDaIVYAB',
    object: 'crypto.onramp_session',
    client_secret: 'cos_0MYfrA589O8KAxCGEDaIVYAB_secret_xyz',
    status: 'initialized',
    livemode: false,
    redirect_url: 'https://crypto.link.com?session_hash=abc',
    transaction_details: { destination_currency: 'usdc', destination_network: 'base', destination_amount: null, source_amount: '25.46', source_currency: 'eur', transaction_id: null, wallet_address: EVM },
  };
  const s = trimSession(raw)!;
  assert.equal(s.url, 'https://crypto.link.com?session_hash=abc');
  assert.equal(s.status, 'initialized');
  assert.equal(s.sourceAmount, '25.46');
  assert.equal((s as unknown as Record<string, unknown>).client_secret, undefined);
  assert.equal(trimSession({ ...raw, redirect_url: 'https://evil.example/x' })!.url, null);
  assert.equal(trimSession({ ...raw, redirect_url: 'https://crypto.link.com.evil.example/x' })!.url, null);
  assert.equal(trimSession({ ...raw, redirect_url: 'http://crypto.link.com/x' })!.url, null);
  assert.equal(trimSession({ ...raw, redirect_url: 'https://evillink.com/x' })!.url, null);
  assert.equal(trimSession({ ...raw, status: 'weird' }), null);
  assert.equal(trimSession({ ...raw, id: 'pi_123' }), null);
  assert.ok(isSessionId('cos_0MYfrA589O8KAxCGEDaIVYAB'));
  assert.ok(!isSessionId('cos_../x'));
  assert.equal(stripeError({ error: { code: 'crypto_onramp_unsupported_country', message: 'x' } }), 'crypto_onramp_unsupported_country');
  assert.equal(stripeError(null), 'stripe error');
});
