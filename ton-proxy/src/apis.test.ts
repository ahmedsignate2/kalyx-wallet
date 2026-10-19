// node --experimental-strip-types --test src/apis.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { etherscanError, resolveApi, sanitizeJsonBody } from './apis.ts';

const ADDR = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';
const SOL = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const KEYS = { coingecko: 'CLE-CG', lifi: 'CLE-LIFI', relaylink: 'CLE-RL', etherscan: 'CLE-ES', covalent: 'CLE-CV', helius: 'CLE-HL' };
const q = (s: string) => new URLSearchParams(s);
const ok = (method: string, path: string, search = '') => {
  const r = resolveApi(method, path, q(search));
  assert.ok(r && r.ok, `${method} ${path}?${search}`);
  return r;
};
const ko = (method: string, path: string, search = '') => {
  const r = resolveApi(method, path, q(search));
  assert.ok(r && !r.ok, `${method} ${path}?${search}`);
  return r;
};

test('chemins inconnus du module : null (TonAPI, RPC… ailleurs)', () => {
  assert.equal(resolveApi('GET', '/mainnet/v2/accounts/x', q('')), null);
  assert.equal(resolveApi('POST', '/rpc/helius', q('')), null);
});

test('CoinGecko : routes connues, paramètres contrôlés, clé en en-tête', () => {
  const r = ok('GET', '/cg/api/v3/simple/price', 'vs_currencies=eur&ids=bitcoin,ethereum&include_24hr_change=true');
  const up = r.upstream(KEYS)!;
  // Paramètres triés : même requête = même entrée de cache.
  assert.equal(up.url, 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin%2Cethereum&include_24hr_change=true&vs_currencies=eur');
  assert.equal(up.headers['x-cg-demo-api-key'], 'CLE-CG');
  assert.equal(r.upstream({})!.headers['x-cg-demo-api-key'], undefined);
  ok('GET', '/cg/api/v3/coins/bitcoin', 'localization=true&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false');
  ok('GET', '/cg/api/v3/coins/markets', 'vs_currency=eur&order=market_cap_desc&per_page=20&page=1&sparkline=true&price_change_percentage=24h');
  ok('GET', '/cg/api/v3/coins/bitcoin/market_chart', 'vs_currency=eur&days=max');
  ok('GET', `/cg/api/v3/simple/token_price/ethereum`, `contract_addresses=${ADDR}&vs_currencies=eur`);
  ok('GET', '/cg/api/v3/search', 'query=pepe coin');
  ok('GET', '/cg/api/v3/search/trending');
  assert.equal(ko('GET', '/cg/api/v3/simple/price', 'ids=bitcoin&vs_currencies=eur&x_cg_pro_api_key=x').status, 400);
  assert.equal(ko('GET', '/cg/api/v3/simple/price', 'ids=bitcoin').status, 400);
  assert.equal(ko('GET', '/cg/api/v3/simple/price', 'ids=bitcoin&ids=eth&vs_currencies=eur').status, 400);
  assert.equal(ko('GET', '/cg/api/v3/key').status, 404);
  assert.equal(ko('GET', '/cg/api/v3/coins/../key').status, 404);
  assert.equal(ko('POST', '/cg/api/v3/search/trending').status, 405);
});

test('LI.FI : devis jamais en cache, clé ajoutée par le relais', () => {
  const r = ok('GET', '/lifi/v1/quote', `fromChain=1&toChain=8453&fromToken=0x0000000000000000000000000000000000000000&toToken=${ADDR}&fromAmount=1000000&fromAddress=${ADDR}&integrator=nova-wallet&slippage=0.005&fee=0.003`);
  assert.equal(r.cacheSeconds, 0);
  assert.equal(r.upstream(KEYS)!.headers['x-lifi-api-key'], 'CLE-LIFI');
  assert.ok(r.upstream(KEYS)!.url.startsWith('https://li.quest/v1/quote?'));
  assert.equal(ok('GET', '/lifi/v1/tokens', 'chains=SOL&chainTypes=SVM').cacheSeconds, 3_600);
  assert.equal(ko('GET', '/lifi/v1/quote', 'fromChain=1').status, 400);
  assert.equal(ko('GET', '/lifi/v1/advanced/routes').status, 404);
  assert.equal(ko('GET', '/lifi/v1/tokens', 'chains=1&apiKey=x').status, 400);
});

test('Relay.link : POST /quote seulement, refusé sans clé côté serveur', () => {
  const r = ok('POST', '/relaylink/quote');
  assert.equal(r.upstream({}), null);
  assert.equal(r.upstream(KEYS)!.headers.authorization, 'Bearer CLE-RL');
  assert.equal(ko('GET', '/relaylink/quote').status, 405);
  assert.equal(ko('POST', '/relaylink/execute/swap').status, 404);
});

test('Etherscan : historique de compte seulement', () => {
  const r = ok('GET', '/etherscan/v2/api', `chainid=1&module=account&action=txlist&address=${ADDR}&startblock=0&endblock=99999999&page=1&offset=25&sort=desc`);
  assert.match(r.upstream(KEYS)!.url, /&apikey=CLE-ES$/);
  assert.equal(r.upstream({}), null);
  assert.equal(ko('GET', '/etherscan/v2/api', `chainid=1&module=contract&action=getsourcecode&address=${ADDR}`).status, 400);
  assert.equal(ko('GET', '/etherscan/v2/api', `chainid=1&module=account&action=txlist&address=${ADDR}&apikey=x`).status, 400);
});

test('Covalent : transactions d’une adresse, clé en Bearer', () => {
  const r = ok('GET', `/covalent/v1/1/address/${ADDR}/transactions_v3/page/0/`, 'no-logs=true');
  assert.equal(r.upstream(KEYS)!.url, `https://api.covalenthq.com/v1/1/address/${ADDR}/transactions_v3/page/0/?no-logs=true`);
  assert.equal(r.upstream(KEYS)!.headers.authorization, 'Bearer CLE-CV');
  assert.equal(ko('GET', `/covalent/v1/1/address/${ADDR}/balances_v2/`).status, 404);
});

test('Helius REST : historique, noms, simulation', () => {
  const tx = ok('GET', `/helius/v0/addresses/${SOL}/transactions`);
  assert.equal(tx.upstream(KEYS)!.url, `https://api.helius.xyz/v0/addresses/${SOL}/transactions?api-key=CLE-HL`);
  assert.equal(ok('GET', `/helius/v0/addresses/${SOL}/names`).cacheSeconds, 3_600);
  const sim = ok('POST', '/helius/v0/transactions/simulate');
  assert.equal(sim.maxBody, 64 * 1024);
  assert.equal(sim.upstream({}), null);
  assert.equal(ko('GET', '/helius/v0/addresses/0xabc/transactions').status, 404);
  assert.equal(ko('POST', `/helius/v0/addresses/${SOL}/transactions`).status, 405);
  assert.equal(ko('GET', '/helius/v0/webhooks').status, 404);
});

test('corps POST : JSON objet re-sérialisé, taille bornée', () => {
  assert.equal(sanitizeJsonBody('{ "a" : 1 }', 100), '{"a":1}');
  assert.equal(sanitizeJsonBody('{"a":1}', 3), null);
  assert.equal(sanitizeJsonBody('"texte"', 100), null);
  assert.equal(sanitizeJsonBody('{', 100), null);
  assert.equal(sanitizeJsonBody('', 100), null);
});

test('Etherscan : erreur rendue en 200 détectée, « aucune transaction » non', () => {
  assert.equal(etherscanError('{"status":"0","message":"NOTOK","result":"Max rate limit reached"}'), 'Max rate limit reached');
  assert.equal(etherscanError('{"status":"0","message":"No transactions found","result":[]}'), '');
  assert.equal(etherscanError('{"status":"1","message":"OK","result":[]}'), '');
  assert.equal(etherscanError('<html>'), 'invalid json');
});
