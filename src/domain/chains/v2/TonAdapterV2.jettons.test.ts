/**
 * Jettons sur l'adaptateur TON — réponses TonAPI RÉELLES (`tonapi-jettons-live.json`,
 * relevées à travers le proxy Kalyx le 27/09) et corps de transfert vérifié contre
 * des transferts réels (`tonJettons.test.ts`).
 */
import { hex } from '@scure/base';
import { Cell } from '@ton/core';
import { TonAdapterV2 } from './TonAdapterV2';
import { TonApiClient } from '../ton/tonApi';
import { TonCenterClient } from '../ton/tonCenter';
import { jettonTransferBody, JETTON_TRANSFER_TON, USDT_TON_MASTER } from '../ton/tonJettons';
import type { ChainConfig } from '../types';
import type { Ed25519Signer } from './signer';
import LIVE from '../ton/tonapi-live.json';
import JETTONS from '../ton/tonapi-jettons-live.json';
import KEYS from '../ton/tonkeeper-vectors.json';

const MAIN: ChainConfig = { id: 'ton', name: 'TON', family: 'ton', nativeSymbol: 'TON', nativeDecimals: 9, rpcUrls: ['https://toncenter.com/api'] };
const art = KEYS.keys.find((k) => k.phrase.endsWith(' art'))!;
const FROM = art.v5r1.uq;
const DEST = 'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N';
const signer: Ed25519Signer = { curve: 'ed25519', secretKey: hex.decode(art.seed), publicKey: hex.decode(art.publicKey) };
const NOW = 1_790_000_000_000;

type Reply = { status: number; body: unknown };
function api(routes: Record<string, Reply>) {
  return new TonApiClient('https://proxy/net', async (u, i) => {
    const r = routes[`${i?.method ?? 'GET'} ${decodeURIComponent(u.replace('https://proxy/net', ''))}`] ?? { status: 404, body: { error: 'not found' } };
    return { status: r.status, text: async () => JSON.stringify(r.body) };
  });
}
const noCenter = new TonCenterClient('https://toncenter.invalid/api', async () => { throw new Error('TON Center ne doit pas être appelé'); }, 0, async () => {});

/** L'expéditeur est actif (W5), crédité de 1 TON, et détient les jettons relevés. */
function sender(balanceTon = '1000000000') {
  return api({
    [`GET /v2/accounts/${FROM}`]: { status: 200, body: { ...LIVE.accountActiveW5, balance: Number(balanceTon) } },
    [`GET /v2/wallet/${FROM}/seqno`]: { status: 200, body: { seqno: 7 } },
    [`GET /v2/accounts/${DEST}`]: { status: 200, body: LIVE.accountV3 },
    [`GET /v2/wallet/${DEST}/seqno`]: { status: 200, body: { seqno: 343 } },
    [`GET /v2/accounts/${FROM}/jettons?currencies=usd`]: { status: 200, body: JETTONS.jettons },
    'POST /v2/wallet/emulate': { status: 200, body: LIVE.emulateV3 },
  });
}
const usdtWallet = (JETTONS.jettons.balances as any[]).find((b) => b.jetton.address === USDT_TON_MASTER && b.jetton.verification === 'whitelist')!.wallet_address.address;

/** Toutes les cellules d'un arbre, pour y retrouver un corps par son hachage. */
function hashes(c: Cell, out = new Set<string>()): Set<string> {
  out.add(c.hash().toString('hex'));
  for (const r of c.refs) hashes(r, out);
  return out;
}

describe('jettons — capacités et lecture', () => {
  it('jetons lisibles et envoyables quand TonAPI est là, pas sans lui', () => {
    expect(new TonAdapterV2(MAIN, { api: sender(), client: noCenter }).capabilities).toMatchObject({ tokens: true, tokenSend: true, memo: true });
    expect(new TonAdapterV2(MAIN, { api: null, client: noCenter }).capabilities).toMatchObject({ tokens: false, tokenSend: false });
  });

  it('listTokens : les jettons, sans ceux en liste noire', async () => {
    const list = await new TonAdapterV2(MAIN, { api: sender(), client: noCenter }).listTokens(FROM);
    expect(list.find((t) => t.id === USDT_TON_MASTER)).toMatchObject({ symbol: 'USD₮', decimals: 6, raw: 1060n });
    expect(list.filter((t) => t.symbol === 'USD₮')).toHaveLength(1);
  });
});

describe('client TonAPI — adresses brutes', () => {
  /* Relevé : `0%3A…` n'est pas reconnu par la liste blanche du proxy (404). */
  it('garde le « : » d’une adresse brute dans le chemin', async () => {
    const paths: string[] = [];
    const c = new TonApiClient('https://p/n', async (u) => { paths.push(u); return { status: 200, text: async () => '{"balances":[]}' }; });
    await c.jettons('0:6fd70daadbea735e798b1fa545fb0183a3ae72753f15da9fdd10487a15a9c717');
    expect(paths[0]).toBe('https://p/n/v2/accounts/0:6fd70daadbea735e798b1fa545fb0183a3ae72753f15da9fdd10487a15a9c717/jettons?currencies=usd');
  });
});

describe('jettons — préparation', () => {
  it('débite NOTRE portefeuille de jeton, frais par émulation, rebond obligatoire', async () => {
    const ad = new TonAdapterV2(MAIN, { api: sender(), client: noCenter, now: () => NOW });
    const d = await ad.prepareSend(FROM, { to: DEST, amount: 1000n, token: { id: USDT_TON_MASTER, symbol: 'USDT', decimals: 6 }, memo: 'dépôt 42' });
    expect(d.amount).toBe(1000n);
    expect(d.token).toEqual({ id: USDT_TON_MASTER, symbol: 'USD₮', decimals: 6 });
    expect(d.fee).toBe(372496n);
    expect(d.payload).toMatchObject({ jettonWallet: usdtWallet, bounce: true, comment: 'dépôt 42', seqno: 7, deploys: false });
  });

  it('refuse plus de jetons qu’on n’en a', async () => {
    const ad = new TonAdapterV2(MAIN, { api: sender(), client: noCenter });
    await expect(ad.prepareSend(FROM, { to: DEST, amount: 1061n, token: { id: USDT_TON_MASTER, symbol: 'USDT', decimals: 6 } })).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
  });

  it('refuse un jeton en liste noire, même s’il porte le symbole USD₮', async () => {
    const fake = (JETTONS.jettons.balances as any[]).find((b) => b.jetton.symbol === 'USD₮' && b.jetton.verification === 'blacklist')!.jetton.address;
    const ad = new TonAdapterV2(MAIN, { api: sender(), client: noCenter });
    await expect(ad.prepareSend(FROM, { to: DEST, amount: 1n, token: { id: fake, symbol: 'USD₮', decimals: 6 } })).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
  });

  it('refuse sans assez de TON pour le gaz du jeton', async () => {
    const ad = new TonAdapterV2(MAIN, { api: sender('40000000'), client: noCenter });
    await expect(ad.prepareSend(FROM, { to: DEST, amount: 1n, token: { id: USDT_TON_MASTER, symbol: 'USDT', decimals: 6 } })).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
  });
});

describe('jettons — signature', () => {
  it('le message signé porte le corps TEP-74 exact, adressé à notre portefeuille de jeton', async () => {
    const ad = new TonAdapterV2(MAIN, { api: sender(), client: noCenter, now: () => NOW });
    const d = await ad.prepareSend(FROM, { to: DEST, amount: 1000n, token: { id: USDT_TON_MASTER, symbol: 'USDT', decimals: 6 }, memo: 'dépôt 42' });
    const signed = await ad.signSend(d, signer);
    const tree = hashes(Cell.fromBase64(signed.raw));
    const expected = jettonTransferBody({ amount: 1000n, to: DEST, responseTo: FROM, comment: 'dépôt 42', queryId: BigInt(NOW) });
    expect(tree.has(expected.hash().toString('hex'))).toBe(true);
    // Le TON joint : lu dans le message interne qui porte ce corps.
    const { loadMessageRelaxed } = await import('@ton/core');
    let found = false;
    const walk = (c: Cell) => {
      try {
        const m = loadMessageRelaxed(c.beginParse());
        if (m.info.type === 'internal' && m.body.hash().equals(expected.hash())) {
          expect(m.info.value.coins).toBe(JETTON_TRANSFER_TON);
          expect(m.info.bounce).toBe(true);
          expect(m.info.dest.toRawString()).toBe(usdtWallet);
          found = true;
        }
      } catch { /* pas un message */ }
      c.refs.forEach(walk);
    };
    walk(Cell.fromBase64(signed.raw));
    expect(found).toBe(true);
  });
});

describe('jettons — historique (événements réels)', () => {
  const owner = JETTONS.owner;
  const ad = new TonAdapterV2(MAIN, { api: api({ [`GET /v2/accounts/${owner}/events?limit=25`]: { status: 200, body: { events: JETTONS.events } } }), client: noCenter });

  it('montre un jetton vérifié reçu, avec son symbole et ses décimales', async () => {
    const h = await ad.getHistory(owner);
    expect(h.find((t) => t.asset === 'ECOR')).toMatchObject({ direction: 'in', value: 13810095670n, decimals: 9, status: 'success' });
  });

  it('cache le faux « Tethe USD » reçu sans rien demander', async () => {
    const h = await ad.getHistory(owner);
    expect(h.some((t) => t.asset === 'USDT-GARN')).toBe(false);
  });
});

describe('NFT et noms .ton', () => {
  const NFTS = require('../ton/tonapi-nfts-live.json');
  const owner = 'UQC020bHeiUqqyw8BB4EttblmRidKkT_hnINJ-8rZCP0L1Dw';
  const ad = new TonAdapterV2(MAIN, {
    api: api({
      [`GET /v2/accounts/${owner}/nfts?limit=100&offset=0&indirect_ownership=false`]: { status: 200, body: NFTS.nfts },
      'GET /v2/dns/foundation.ton/resolve': { status: 200, body: NFTS.dnsFoundation },
    }),
    client: noCenter,
  });

  it('NFT sans les arnaques, domaines compris', async () => {
    const list = await ad.nfts(owner);
    expect(list.some((n) => n.dns === 'mygoldtonnft.ton')).toBe(true);
    expect(list.some((n) => /voucher/i.test(n.name))).toBe(false);
  });

  it('résout un nom .ton, rien pour un nom inconnu', async () => {
    expect(await ad.resolveDomain('foundation.ton')).toMatch(/^UQ/);
    expect(await ad.resolveDomain('inconnu.ton')).toBeNull();
    expect(await new TonAdapterV2(MAIN, { api: null, client: noCenter }).resolveDomain('foundation.ton')).toBeNull();
  });
});
