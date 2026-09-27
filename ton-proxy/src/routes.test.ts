// node --experimental-strip-types --test src/routes.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, sanitizeBody } from './routes.ts';

const A = 'UQC020bHeiUqqyw8BB4EttblmRidKkT_hnINJ-8rZCP0L1Dw';
const R = (m: string, p: string, q = '') => resolve(m, p, new URLSearchParams(q));

test('les routes relevées passent, sur les deux réseaux', () => {
  for (const [m, p, q] of [
    ['GET', `/mainnet/v2/accounts/${A}`, ''],
    ['GET', `/testnet/v2/accounts/${A}/events`, 'limit=20&before_lt=99183004000001'],
    ['GET', `/mainnet/v2/accounts/${A}/jettons`, 'currencies=usd,eur'],
    ['GET', `/mainnet/v2/wallet/${A}/seqno`, ''],
    ['GET', '/testnet/v2/blockchain/messages/111097c6ae737d4a980c7629dcca17049a817c5934f7b643200b8cb0aac2215f/transaction', ''],
    ['GET', '/mainnet/v2/rates', 'tokens=ton&currencies=usd'],
    ['GET', `/mainnet/v2/accounts/${A}/nfts`, 'limit=100&offset=0&indirect_ownership=false'],
    ['GET', '/mainnet/v2/dns/foundation.ton/resolve', ''],
    ['GET', '/mainnet/v2/dns/sub.kalyx-wallet.ton/resolve', ''],
    ['GET', '/mainnet/v2/dns/alice.t.me/resolve', ''],
    ['GET', '/mainnet/v2/staking/pool/EQCkWxfyhAkim3g2DjKQQg8T5P4g-Q1-K_jErGcDJZ4i-vqR', ''],
    ['GET', '/mainnet/v2/rates', 'tokens=0:bdf3fa8098d129b54b4f73b5bac5d1e1fd91eb054169c3916dfc8ccd536d1000&currencies=ton'],
    ['POST', '/mainnet/v2/wallet/emulate', ''],
    ['POST', '/testnet/v2/blockchain/message', ''],
  ]) assert.equal(R(m, p, q).ok, true, `${m} ${p}`);
});

test('pas un proxy ouvert : tout le reste est refusé', () => {
  assert.equal(R('GET', '/mainnet/v2/staking/pools').ok, false);
  assert.equal(R('GET', '/v2/accounts/' + A).ok, false); // réseau obligatoire
  assert.equal(R('GET', '/mainnet/v2/accounts/pas-une-adresse').ok, false);
  assert.equal(R('GET', `/mainnet/v2/accounts/${A}/../../admin`).ok, false);
  assert.equal(R('GET', '/mainnet/v2/dns/Foundation.TON/resolve').ok, false); // l'app met en minuscules
  assert.equal(R('GET', '/mainnet/v2/dns/evil.com/resolve').ok, false);
  assert.equal(R('GET', '/mainnet/v2/dns/a..ton/resolve').ok, false);
  assert.equal(R('GET', `/mainnet/v2/accounts/${A}/nfts`, 'limit=1000').ok, false);
  assert.deepEqual(R('DELETE', `/mainnet/v2/accounts/${A}`), { ok: false, status: 405, error: 'method not allowed' });
});

test('les paramètres inconnus ou hors bornes sont refusés, pas ignorés', () => {
  assert.equal(R('GET', `/mainnet/v2/accounts/${A}/events`, 'limit=1000').ok, false);
  assert.equal(R('GET', `/mainnet/v2/accounts/${A}`, 'foo=bar').ok, false);
  const ok = R('GET', `/mainnet/v2/accounts/${A}/events`, 'limit=20');
  assert.equal(ok.ok && ok.upstreamPath, `/v2/accounts/${A}/events?limit=20`);
});

test('corps POST : { boc } seul, re-sérialisé, taille bornée', () => {
  assert.deepEqual(sanitizeBody('{"boc":"te6cckEBAQEAAgAAAEysuc0=","evil":1}'), { ok: true, body: '{"boc":"te6cckEBAQEAAgAAAEysuc0="}' });
  assert.equal(sanitizeBody('{"boc":"<script>"}').ok, false);
  assert.equal(sanitizeBody('pas du json').ok, false);
  assert.equal(sanitizeBody(JSON.stringify({ boc: 'A'.repeat(70_000) })).ok, false);
});

test('cache : jamais le seqno ni le suivi, 10 s pour une adresse', () => {
  const c = (m: string, p: string, q = '') => { const r = R(m, p, q); return r.ok ? r.route.cacheSeconds : 'refus'; };
  assert.equal(c('GET', `/mainnet/v2/wallet/${A}/seqno`), undefined);
  assert.equal(c('GET', '/testnet/v2/blockchain/messages/111097c6ae737d4a980c7629dcca17049a817c5934f7b643200b8cb0aac2215f/transaction'), undefined);
  assert.equal(c('POST', '/mainnet/v2/blockchain/message'), undefined);
  assert.equal(c('GET', `/mainnet/v2/accounts/${A}`), 10);
  assert.equal(c('GET', '/mainnet/v2/rates', 'tokens=ton&currencies=usd'), 60);
});
