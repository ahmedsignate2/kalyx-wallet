/**
 * Adaptateur TON sur TonAPI — réponses RÉELLES capturées à travers le proxy
 * Kalyx (`tonapi-live.json`), et repli sur TON Center quand TonAPI échoue.
 */
import { TonAdapterV2 } from './TonAdapterV2';
import { TonApiClient } from '../ton/tonApi';
import { TonCenterClient } from '../ton/tonCenter';
import type { ChainConfig } from '../types';
import LIVE from '../ton/tonapi-live.json';

const MAIN: ChainConfig = { id: 'ton', name: 'TON', family: 'ton', nativeSymbol: 'TON', nativeDecimals: 9, rpcUrls: ['https://toncenter.com/api'] };
const TEST: ChainConfig = { ...MAIN, id: 'ton-testnet', testnet: true, rpcUrls: ['https://testnet.toncenter.com/api'] };
const ART = 'UQC020bHeiUqqyw8BB4EttblmRidKkT_hnINJ-8rZCP0L1Dw';
const V3 = 'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N';
const NEVER = 'UQC0KX0C7pbV_HmNNA3MS_6YSjBC4pLJEHTWTFpjtDLwUqT-';
const USDT = 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs';
const TESTW = '0QAHnB2FOTQY4Y7W7Yp33rvQz6fIEzZ8398pbTweyDrrEu_5';

type Reply = { status: number; body: unknown };
function api(routes: Record<string, Reply>, calls: string[] = []) {
  return new TonApiClient('https://proxy/net', async (u, i) => {
    const path = u.replace('https://proxy/net', '');
    calls.push(`${i?.method ?? 'GET'} ${path}`);
    const r = routes[`${i?.method ?? 'GET'} ${decodeURIComponent(path)}`] ?? { status: 404, body: { error: 'not found' } };
    return { status: r.status, text: async () => JSON.stringify(r.body) };
  });
}
const noCenter = new TonCenterClient('https://toncenter.invalid/api', async () => { throw new Error('TON Center ne doit pas être appelé'); }, 0, async () => {});

describe('TonAPI — lecture', () => {
  it('état : version, seqno, contrat, jamais utilisé, memo_required', async () => {
    const a = api({
      [`GET /v2/accounts/${ART}`]: { status: 200, body: LIVE.accountActiveW5 },
      [`GET /v2/wallet/${ART}/seqno`]: { status: 200, body: LIVE.seqnoW5 },
      [`GET /v2/accounts/${NEVER}`]: { status: 200, body: LIVE.accountNeverUsed },
      [`GET /v2/accounts/${USDT}`]: { status: 200, body: LIVE.accountContract },
    });
    expect(await a.accountState(ART)).toMatchObject({ status: 'active', version: 'v5r1', seqno: 1, used: true, balance: 0n });
    expect(await a.accountState(NEVER)).toMatchObject({ status: 'nonexist', used: false, balance: 0n });
    expect(await a.accountState(USDT)).toMatchObject({ status: 'active', notWallet: true });
  });

  /* Le solde est un NOMBRE JSON : au-delà de 2^53 nanotons, JSON.parse l'arrondirait. */
  it('lit le solde en texte brut, sans arrondi', async () => {
    const big = '{"address":"0:00","balance":123456789012345678901,"status":"active","interfaces":["wallet_v4r2"],"is_wallet":true,"last_activity":1}';
    const a = new TonApiClient('https://p/n', async (u) => ({ status: 200, text: async () => (u.endsWith('/seqno') ? '{"seqno":4}' : big) }));
    expect((await a.accountState(V3)).balance).toBe(123456789012345678901n);
  });

  it('frais exacts par émulation : −extra', async () => {
    const a = api({ 'POST /v2/wallet/emulate': { status: 200, body: LIVE.emulateV3 } });
    expect(await a.emulateFee('Qk9D')).toBe(372496n);
  });

  it('suivi : transaction trouvée par le hachage du message, ou null tant qu’elle n’existe pas', async () => {
    const h = '111097c6ae737d4a980c7629dcca17049a817c5934f7b643200b8cb0aac2215f';
    const a = api({ [`GET /v2/blockchain/messages/${h}/transaction`]: { status: 200, body: LIVE.txByMessage } });
    expect(await a.transactionByMessage(h)).toMatchObject({ hash: '78c6f81e96a4bb5bc91137c87b87b559524d757ad9f6b27de3465b01fa722ecd', ok: true });
    expect(await a.transactionByMessage('00'.repeat(32))).toBeNull();
  });
});

describe('adaptateur sur TonAPI', () => {
  it('historique lu dans les événements, commentaires compris', async () => {
    const ad = new TonAdapterV2(TEST, { api: api({ [`GET /v2/accounts/${TESTW}/events?limit=25`]: { status: 200, body: LIVE.events } }), client: noCenter });
    const h = await ad.getHistory(TESTW);
    expect(h.length).toBeGreaterThanOrEqual(3);
    expect(h[0]).toMatchObject({ direction: 'out', status: 'success', value: 20_000_000n, description: 'Kalyx — second envoi', hash: '78c6f81e96a4bb5bc91137c87b87b559524d757ad9f6b27de3465b01fa722ecd' });
    expect(h.some((t) => t.direction === 'in' && t.value === 2_000_000_000n)).toBe(true);
    // L'envoi porte le hachage de message que l'app a rendu : le suivi le retrouve sans autre appel.
    expect(h[0].messageHash).toBe('111097c6ae737d4a980c7629dcca17049a817c5934f7b643200b8cb0aac2215f');
  });

  /*
   * Relevé sur le vrai compte de test : un dépôt de 0,001 TON arrivé AVANT le
   * déploiement a rebondi (0,000933 renvoyés). Ce n'est pas un envoi.
   */
  it('un rebond n’est pas un envoi : reçu net, marqué BOUNCE', async () => {
    const ad = new TonAdapterV2(TEST, { api: api({ [`GET /v2/accounts/${TESTW}/events?limit=25`]: { status: 200, body: LIVE.events } }), client: noCenter });
    const h = await ad.getHistory(TESTW);
    const bounce = h.find((t) => t.hash.startsWith('5513a710'))!;
    expect(bounce).toMatchObject({ direction: 'in', type: 'BOUNCE', value: 1_000_000n - 933_333n });
    expect(h.filter((t) => t.direction === 'out').map((t) => t.value)).toEqual([20_000_000n, 50_000_000n]);
  });

  it('suivi d’un envoi : le hachage du message donne la transaction, puis « confirmé »', async () => {
    const h = '111097c6ae737d4a980c7629dcca17049a817c5934f7b643200b8cb0aac2215f';
    const ad = new TonAdapterV2(TEST, { api: api({ [`GET /v2/blockchain/messages/${h}/transaction`]: { status: 200, body: LIVE.txByMessage } }), client: noCenter });
    expect(await ad.transactionHashForMessage(h)).toBe('78c6f81e96a4bb5bc91137c87b87b559524d757ad9f6b27de3465b01fa722ecd');
    expect(await ad.waitForTx(h)).toEqual({ status: 'confirmed', at: LIVE.txByMessage.utime * 1000 });
  });

  it('préparation : frais EXACTS par émulation, sans marge', async () => {
    const ad = new TonAdapterV2(MAIN, {
      api: api({
        [`GET /v2/accounts/${V3}`]: { status: 200, body: LIVE.accountV3 },
        [`GET /v2/wallet/${V3}/seqno`]: { status: 200, body: { seqno: 343 } },
        [`GET /v2/accounts/${ART}`]: { status: 200, body: LIVE.accountActiveW5 },
        [`GET /v2/wallet/${ART}/seqno`]: { status: 200, body: LIVE.seqnoW5 },
        'POST /v2/wallet/emulate': { status: 200, body: LIVE.emulateV3 },
      }),
      client: noCenter,
    });
    const d = await ad.prepareSend(V3, { to: ART, amount: 10_000_000n, memo: 'kalyx' });
    expect(d.fee).toBe(372496n);
    expect(d.payload).toMatchObject({ version: 'v3r2', seqno: 343, bounce: false });
  });

  it('adresse qui EXIGE un commentaire, laissé vide → avertissement bloquant', async () => {
    const exchange = { ...LIVE.accountV3, memo_required: true };
    const ad = new TonAdapterV2(MAIN, {
      api: api({
        [`GET /v2/accounts/${V3}`]: { status: 200, body: LIVE.accountV3 },
        [`GET /v2/wallet/${V3}/seqno`]: { status: 200, body: { seqno: 343 } },
        [`GET /v2/accounts/${ART}`]: { status: 200, body: exchange },
        [`GET /v2/wallet/${ART}/seqno`]: { status: 200, body: { seqno: 9 } },
        'POST /v2/wallet/emulate': { status: 200, body: LIVE.emulateV3 },
      }),
      client: noCenter,
    });
    expect((await ad.prepareSend(V3, { to: ART, amount: 1n })).warnings).toContainEqual({ code: 'MEMO_REQUIRED', severity: 'danger' });
    expect((await ad.prepareSend(V3, { to: ART, amount: 1n, memo: '12345' })).warnings).not.toContainEqual(expect.objectContaining({ code: 'MEMO_REQUIRED' }));
  });

  /* TON ne dépend jamais d'un seul fournisseur. */
  it('TonAPI injoignable → le solde vient de TON Center', async () => {
    const down = new TonApiClient('https://p/n', async () => { throw new Error('offline'); });
    const center = new TonCenterClient('https://toncenter.com/api', async () => ({ status: 200, text: async () => '{"balance":"42","status":"active","wallet_type":"wallet v5 r1","seqno":1,"last_transaction_lt":"1"}' }), 0, async () => {});
    const ad = new TonAdapterV2(MAIN, { api: down, client: center });
    expect((await ad.getBalance(ART)).raw).toBe(42n);
  });

  it('diffusion : un REFUS n’est pas rejoué ailleurs, une panne du proxy si', async () => {
    const refused = new TonApiClient('https://p/n', async () => ({ status: 406, text: async () => '{"error":"cannot apply external message"}' }));
    const ad1 = new TonAdapterV2(MAIN, { api: refused, client: noCenter });
    await expect(ad1.broadcastSend({ chainId: 'ton', raw: 'Qk9D', txid: 'ab', draft: {} as never })).rejects.toMatchObject({ code: 'BROADCAST_FAILED' });
    let relayed = false;
    const center = new TonCenterClient('https://toncenter.com/api', async () => { relayed = true; return { status: 200, text: async () => '{}' }; }, 0, async () => {});
    const down = new TonApiClient('https://p/n', async () => { throw new Error('offline'); });
    await new TonAdapterV2(MAIN, { api: down, client: center }).broadcastSend({ chainId: 'ton', raw: 'Qk9D', txid: 'ab', draft: {} as never });
    expect(relayed).toBe(true);
  });
});
