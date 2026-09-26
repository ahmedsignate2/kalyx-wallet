/**
 * Adaptateur TON, contre un faux TON Center nourri de réponses RÉELLES.
 *
 * Les corps de réponse reproduisent ceux relevés en interrogeant TON Center le
 * 26/09 (voir `tonCenter.ts`) ; l'historique est une réponse réelle figée
 * (`ton-live-history.json`). Et le premier envoi est comparé octet pour octet au
 * transfert de référence produit par `@ton/ton` : de la préparation au BOC,
 * l'adaptateur ne s'écarte pas de la bibliothèque officielle.
 */
import { hex } from '@scure/base';
import { TonAdapterV2, TON_TARGET_CAPABILITIES } from './TonAdapterV2';
import { findAdapterV2 } from './registry';
import { listChains } from '../registry';
import { NO_CAPABILITIES } from './capabilities';
import { TonCenterClient } from '../ton/tonCenter';
import type { ChainConfig } from '../types';
import type { ChainSigner, Ed25519Signer } from './signer';
import KEYS from '../ton/tonkeeper-vectors.json';
import TX from '../ton/ton-transfer-vectors.json';
import HISTORY from '../ton/ton-live-history.json';

const MAINNET: ChainConfig = { id: 'ton', name: 'TON', family: 'ton', nativeSymbol: 'TON', nativeDecimals: 9, rpcUrls: ['https://toncenter.com/api'] };
const TESTNET: ChainConfig = { ...MAINNET, id: 'ton-testnet', testnet: true, rpcUrls: ['https://testnet.toncenter.com/api'] };

const art = KEYS.keys.find((k) => k.phrase.endsWith(' art'))!;
const other = KEYS.keys[0];
const signerOf = (k: { seed: string; publicKey: string }): Ed25519Signer => ({ curve: 'ed25519', secretKey: hex.decode(k.seed), publicKey: hex.decode(k.publicKey) });

// ---------------------------------------------------------------- faux TON Center
type Reply = { status: number; body: unknown };
type Route = (method: string, url: URL, body: any) => Reply | undefined;

function fakeCenter(routes: Route[]) {
  const calls: { method: string; path: string; body: any }[] = [];
  const fetchFn = async (u: string, init?: { method?: string; body?: string }) => {
    const url = new URL(u);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, path: url.pathname + url.search, body });
    for (const r of routes) {
      const hit = r(method, url, body);
      if (hit) return { status: hit.status, text: async () => JSON.stringify(hit.body) };
    }
    return { status: 404, text: async () => JSON.stringify({ error: 'route absente du faux' }) };
  };
  return { calls, client: (base: string) => new TonCenterClient(base, fetchFn, 0, async () => {}) };
}

/** `walletInformation` d'une adresse donnée, sous les formes relevées. */
const wallet = (address: string, reply: Reply): Route => (m, url) =>
  m === 'GET' && url.pathname.endsWith('/v3/walletInformation') && url.searchParams.get('address') === address ? reply : undefined;
const ACTIVE_W5 = (balance: string, seqno: number): Reply => ({ status: 200, body: { balance, wallet_type: 'wallet v5 r1', seqno, wallet_id: 2147483409, last_transaction_lt: '79272070000001', status: 'active' } });
const UNINIT = (balance = '0', used = false): Reply => ({ status: 200, body: { balance, last_transaction_lt: used ? '98521915000007' : '0', status: 'uninit' } });
const FEE: Route = (m, url) => (m === 'POST' && url.pathname.endsWith('/v2/estimateFee')
  ? { status: 200, body: { ok: true, result: { source_fees: { in_fwd_fee: 124001, storage_fee: 488194, gas_fee: 159668, fwd_fee: 0 } } } }
  : undefined);

function adapter(config: ChainConfig, routes: Route[], now = 1_790_000_000_000) {
  const f = fakeCenter(routes);
  let t = now;
  const a = new TonAdapterV2(config, { client: f.client(config.rpcUrls[0]), now: () => t, sleep: async (ms) => { t += ms; } });
  return { a, calls: f.calls, advance: (ms: number) => { t += ms; } };
}

const FROM = art.v5r1.uq;
const DEST_UNINIT = KEYS.keys[3].v5r1.uq; // UQ… : non rebondissante
const DEST_ACTIVE_EQ = KEYS.keys[4].v4r2.eq; // EQ… : rebondissante

// ---------------------------------------------------------------- tests
describe('TonAdapterV2 — enregistrement', () => {
  it('toujours aucune chaîne TON enregistrée (l’activation est une étape à part)', () => {
    expect(listChains({ includeTestnets: true }).some((c) => c.family === 'ton')).toBe(false);
    expect(findAdapterV2('ton')).toBeNull();
  });

  it('refuse une configuration qui n’est pas TON', () => {
    expect(() => new TonAdapterV2({ ...MAINNET, family: 'evm' })).toThrow(/non-TON/);
  });

  it('ne déclare que ce qui fonctionne : le commentaire', () => {
    const a = new TonAdapterV2(MAINNET);
    expect(a.capabilities).toEqual({ ...NO_CAPABILITIES, memo: true });
    expect(a.signerCurve).toBe('ed25519');
  });

  it('la dérivation depuis une graine reste refusée : le compte TON vient de la phrase', () => {
    expect(() => new TonAdapterV2(MAINNET).deriveAccount()).toThrow(/phrase/);
  });
});

describe('validateAddress', () => {
  const testForm = KEYS.keys[3].v5r1Testnet.uq;
  it('réseau principal : refuse une adresse marquée « test »', () => {
    const a = new TonAdapterV2(MAINNET);
    expect(a.validateAddress(FROM)).toBe(true);
    expect(a.validateAddress(art.v5r1.raw)).toBe(true);
    expect(a.validateAddress(testForm)).toBe(false);
    expect(a.validateAddress('0x28C6c06298d514Db089934071355E5743bf21d60')).toBe(false);
  });
  it('réseau de test : accepte les deux écritures et les adresses brutes', () => {
    const a = new TonAdapterV2(TESTNET);
    expect(a.validateAddress(testForm)).toBe(true);
    expect(a.validateAddress(FROM)).toBe(true);
    expect(a.validateAddress(art.v5r1.raw)).toBe(true);
  });
});

describe('getBalance', () => {
  it('lit le solde de walletInformation', async () => {
    const { a } = adapter(MAINNET, [wallet(FROM, ACTIVE_W5('1592540632745552', 343))]);
    expect(await a.getBalance(FROM)).toEqual({ raw: 1592540632745552n, decimals: 9, symbol: 'TON' });
  });
});

describe('prepareSend', () => {
  const req = (to: string, amount = 100_000_000n, memo?: string) => ({ to, amount, memo });

  it('compte actif → destinataire jamais déployé : pas de rebond, avertissement, frais du nœud + marge', async () => {
    const { a, calls } = adapter(MAINNET, [wallet(FROM, ACTIVE_W5('5000000000', 7)), wallet(DEST_UNINIT, UNINIT()), FEE]);
    const d = await a.prepareSend(FROM, req(DEST_UNINIT, 100_000_000n, '  facture 42  '));
    expect(d.payload).toEqual({ seqno: 7, deploys: false, version: 'v5r1', bounce: false, comment: 'facture 42', sendMode: 3 });
    expect(d.warnings).toEqual([{ code: 'ACTIVATES_DESTINATION', severity: 'info' }]);
    expect(d.fee).toBe(124001n + 488194n + 159668n + 1_000_000n);
    // L'estimation porte bien sur l'adresse d'envoi, avec un corps signé par des zéros.
    const est = calls.find((c) => c.path.endsWith('/v2/estimateFee'))!;
    expect(est.body.address).toBe(FROM);
    expect(est.body.ignore_chksig).toBe(true);
  });

  /* La règle de Tonkeeper : sinon, rebond si et seulement si le destinataire est actif. */
  it('adresse rebondissante vers un compte actif → rebond', async () => {
    const { a } = adapter(MAINNET, [wallet(FROM, ACTIVE_W5('5000000000', 1)), wallet(DEST_ACTIVE_EQ, ACTIVE_W5('1', 3)), FEE]);
    const d = await a.prepareSend(FROM, req(DEST_ACTIVE_EQ));
    expect(d.payload.bounce).toBe(true);
    expect(d.warnings).toEqual([]);
  });

  it('adresse rebondissante vers un compte NON déployé → pas de rebond (les fonds y restent)', async () => {
    const { a } = adapter(MAINNET, [wallet(FROM, ACTIVE_W5('5000000000', 1)), wallet(DEST_ACTIVE_EQ, UNINIT('1', true)), FEE]);
    expect((await a.prepareSend(FROM, req(DEST_ACTIVE_EQ))).payload.bounce).toBe(false);
  });

  it('un contrat qui n’est pas un portefeuille → avertissement, et rebond', async () => {
    const usdt = 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs';
    const { a } = adapter(MAINNET, [
      wallet(FROM, ACTIVE_W5('5000000000', 1)),
      wallet(usdt, { status: 409, body: { error: 'not a wallet' } }),
      (m, url) => (url.pathname.endsWith('/v3/account') ? { status: 200, body: { balance: '99', status: 'active', last_transaction_lt: '5' } } : undefined),
      FEE,
    ]);
    const d = await a.prepareSend(FROM, req(usdt));
    expect(d.warnings).toContainEqual({ code: 'DESTINATION_NOT_WALLET', severity: 'warning' });
    expect(d.payload.bounce).toBe(true);
  });

  it('premier envoi d’un compte non déployé : déploiement, seqno 0, estimation prudente sans appel au nœud', async () => {
    const { a, calls } = adapter(MAINNET, [wallet(FROM, UNINIT('2000000000', true)), wallet(DEST_UNINIT, UNINIT())]);
    const d = await a.prepareSend(FROM, req(DEST_UNINIT));
    expect(d.payload).toMatchObject({ seqno: 0, deploys: true, version: undefined });
    expect(d.fee).toBe(10_000_000n);
    expect(calls.some((c) => c.path.includes('estimateFee'))).toBe(false);
  });

  it('nœud d’estimation indisponible : estimation prudente plutôt que blocage', async () => {
    const { a } = adapter(MAINNET, [wallet(FROM, ACTIVE_W5('5000000000', 1)), wallet(DEST_UNINIT, UNINIT())]);
    expect((await a.prepareSend(FROM, req(DEST_UNINIT))).fee).toBe(10_000_000n);
  });

  it('refus : solde insuffisant, contrat non pris en charge, adresse, montant, jeton', async () => {
    const poor = adapter(MAINNET, [wallet(FROM, ACTIVE_W5('100500000', 1)), wallet(DEST_UNINIT, UNINIT()), FEE]);
    await expect(poor.a.prepareSend(FROM, req(DEST_UNINIT))).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });

    const odd = adapter(MAINNET, [wallet(FROM, { status: 200, body: { balance: '9', wallet_type: 'wallet highload v3', seqno: 1, status: 'active', last_transaction_lt: '1' } })]);
    await expect(odd.a.prepareSend(FROM, req(DEST_UNINIT))).rejects.toMatchObject({ code: 'NOT_SUPPORTED' });

    const { a } = adapter(MAINNET, []);
    await expect(a.prepareSend(FROM, req('pas une adresse'))).rejects.toMatchObject({ code: 'INVALID_ADDRESS' });
    await expect(a.prepareSend(FROM, req(DEST_UNINIT, 0n))).rejects.toMatchObject({ code: 'INVALID_AMOUNT' });
    await expect(a.prepareSend(FROM, { ...req(DEST_UNINIT), token: { id: 'x', symbol: 'USDT', decimals: 6 } })).rejects.toMatchObject({ code: 'NOT_SUPPORTED' });
  });
});

describe('signSend — de la préparation au BOC, comme @ton/ton', () => {
  /*
   * Le transfert de référence n°0 (`@ton/ton`) : W5, premier envoi, clé de la
   * phrase de test confirmée dans Tonkeeper, 0,1 TON non rebondissant commenté,
   * échéance 1 790 000 000. À horloge égale, l'adaptateur doit produire
   * EXACTEMENT le même message.
   */
  it('premier envoi : BOC identique au transfert de référence', async () => {
    const ref = TX.transfers[0];
    expect(ref.publicKey).toBe(art.publicKey);
    const m = ref.messages[0];
    const { a } = adapter(MAINNET, [wallet(FROM, UNINIT('2000000000', true)), wallet(m.to, UNINIT())], (ref.validUntil - 300) * 1000);
    const draft = await a.prepareSend(FROM, { to: m.to, amount: BigInt(m.amount), memo: (m as { comment?: string }).comment });
    const signed = await a.signSend(draft, signerOf(art));
    expect(signed.raw).toBe(ref.boc);
    expect(signed.txid).toMatch(/^[0-9a-f]{64}$/);
    expect(signed.draft.expiresAt).toBe(ref.validUntil * 1000);
  });

  it('refuse une clé qui ne possède pas l’adresse d’envoi', async () => {
    const { a } = adapter(MAINNET, [wallet(FROM, ACTIVE_W5('5000000000', 1)), wallet(DEST_UNINIT, UNINIT()), FEE]);
    const draft = await a.prepareSend(FROM, { to: DEST_UNINIT, amount: 1_000_000n });
    await expect(a.signSend(draft, signerOf(other))).rejects.toMatchObject({ code: 'NOT_SUPPORTED' });
    const secp = { curve: 'secp256k1', privateKey: new Uint8Array(32), publicKey: new Uint8Array(33) } as ChainSigner;
    await expect(a.signSend(draft, secp)).rejects.toThrow();
  });
});

describe('broadcastSend', () => {
  it('diffuse le BOC et rend le hachage normalisé comme identifiant', async () => {
    const { a, calls } = adapter(MAINNET, [(m, url) => (m === 'POST' && url.pathname.endsWith('/v3/message') ? { status: 200, body: { message_hash: 'x' } } : undefined)]);
    const out = await a.broadcastSend({ chainId: 'ton', raw: 'Qk9D', txid: 'ab'.repeat(32), draft: { expiresAt: 42 } as never });
    expect(out).toEqual({ txid: 'ab'.repeat(32), expiresAt: 42 });
    expect(calls[0].body).toEqual({ boc: 'Qk9D' });
  });

  it('un refus du nœud est un échec de diffusion, traduit par son code', async () => {
    const { a } = adapter(MAINNET, [() => ({ status: 500, body: { error: 'External message was not accepted' } })]);
    await expect(a.broadcastSend({ chainId: 'ton', raw: 'Qk9D', txid: 'ab', draft: {} as never })).rejects.toMatchObject({ code: 'BROADCAST_FAILED' });
  });
});

describe('waitForTx — on lit la transaction, pas la diffusion', () => {
  const byMsg = (txs: unknown[]): Route => (m, url) => (url.pathname.endsWith('/v3/transactionsByMessage') ? { status: 200, body: { transactions: txs } } : undefined);
  const real = HISTORY.transactions[0]; // envoi réel : calcul et action réussis

  it('transaction trouvée, phases réussies → confirmée', async () => {
    const { a } = adapter(MAINNET, [byMsg([real])]);
    expect(await a.waitForTx('ab'.repeat(32))).toEqual({ status: 'confirmed', at: real.now * 1000 });
  });

  /* Avec IGNORE_ERRORS, un envoi sans fonds est SAUTÉ en silence, et la phase se dit réussie. */
  it('action sautée faute de fonds → échec, même si la phase se dit réussie', async () => {
    const skipped = { ...real, description: { ...real.description, action: { ...real.description.action, success: true, no_funds: false, skipped_actions: 1 } } };
    const { a } = adapter(MAINNET, [byMsg([skipped])]);
    expect(await a.waitForTx('ab')).toEqual({ status: 'failed', reason: 'fonds insuffisants' });
  });

  it('calcul en échec → échec, avec le code', async () => {
    const bad = { ...real, description: { aborted: true, compute_ph: { success: false, exit_code: 33 }, action: null } };
    const { a } = adapter(MAINNET, [byMsg([bad])]);
    expect(await a.waitForTx('ab')).toEqual({ status: 'failed', reason: 'calcul, code 33' });
  });

  it('introuvable après l’échéance et le retard de l’indexeur → expirée, rien n’a été débité', async () => {
    const { a, calls } = adapter(MAINNET, [byMsg([])]);
    const expiresAt = 1_790_000_000_000 + 300_000;
    expect(await a.waitForTx('ab', { expiresAt })).toEqual({ status: 'expired' });
    expect(calls.length).toBeGreaterThan(100); // a sondé jusqu'au bout (horloge simulée)
  });

  it('une erreur passagère de l’indexeur n’interrompt pas le suivi', async () => {
    let n = 0;
    const flaky: Route = (m, url) => (url.pathname.endsWith('/v3/transactionsByMessage') ? (++n < 3 ? { status: 503, body: {} } : { status: 200, body: { transactions: [real] } }) : undefined);
    const { a } = adapter(MAINNET, [flaky]);
    expect((await a.waitForTx('ab')).status).toBe('confirmed');
  });
});

describe('getHistory — réponse réelle de TON Center', () => {
  it('un envoi et un reçu, lus correctement', async () => {
    const { a } = adapter(MAINNET, [(m, url) => (url.pathname.endsWith('/v3/transactions') ? { status: 200, body: { transactions: HISTORY.transactions, address_book: HISTORY.address_book } } : undefined)]);
    const [sent, received] = await a.getHistory(HISTORY.account);
    expect(sent).toMatchObject({ direction: 'out', status: 'success', value: 1171729n, from: HISTORY.account, asset: 'TON', decimals: 9 });
    expect(sent.hash).toMatch(/^[0-9a-f]{64}$/);
    /*
     * Reçu par un compte pas encore déployé : le réseau le marque `aborted`
     * (aucun code à exécuter) alors que les fonds sont crédités. C'est un reçu RÉUSSI.
     */
    expect(HISTORY.transactions[1].description.aborted).toBe(true);
    expect(received).toMatchObject({ direction: 'in', status: 'success', value: 3000000n, from: 'UQAfPZl7MGtsMq_nRY6UyeWh9e0qs8Vj5ToOcCI-vTPvM_xm' });
  });
});

describe('capacités VISÉES', () => {
  it('ni paliers de frais, ni accélération, ni annulation — et le mémo', () => {
    expect(TON_TARGET_CAPABILITIES.feeTiers).toBe(false);
    expect(TON_TARGET_CAPABILITIES.accelerate).toBe(false);
    expect(TON_TARGET_CAPABILITIES.cancel).toBe(false);
    expect(TON_TARGET_CAPABILITIES.memo).toBe(true);
    expect(TON_TARGET_CAPABILITIES.activatesDestination).toBe(true);
  });
});
