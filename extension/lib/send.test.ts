import { beforeEach, describe, expect, test } from 'vitest';
import { base58 } from '@scure/base';
import { bytesToHex } from '@noble/hashes/utils';
import { makeSend } from './send';
import { addressKey, makeWhitelist } from './whitelist';
import { BTC_CAIP } from './companionCore';
import { makeHome } from './home';
import { makePortfolio } from './portfolio';
import { makeSession } from './session';
import { makeStore, type StorageArea } from './storage';
import { makeWallets } from './wallets';
import { handleInternal } from './router';
import type { Companion } from './companion';
import { activityT } from '../ui/i18n';
import { BITCOIN, ETHEREUM, SOLANA, TON } from '../../src/domain/chains/configs';
import { formatTonAddress, isValidTonAddress, parseTonAddress } from '../../src/domain/chains/ton/tonAddress';
import { addressForChain } from '../../lib/accountAddress';
import { BitcoinChainAdapter } from '../../src/domain/chains/BitcoinChainAdapter';
import { BitcoinAdapterV2 } from '../../src/domain/chains/v2/BitcoinAdapterV2';
import { p2wpkhAddress } from '../../src/crypto/btc';
import { evmAccountFromPrivateKey, deriveEvmAccount } from '../../src/crypto/hd';
import { mnemonicToSeedSync } from '../../src/crypto/mnemonic';
import type { ChainAdapterV2, SendDraft, SendRequest } from '../../src/domain/chains/v2/types';
import type { ChainSigner } from '../../src/domain/chains/v2/signer';
import type { ChainConfig, TxSummary } from '../../src/domain/chains/types';
import type { Holding } from '../../lib/portfolio/holdings';

const ABOUT = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const EVM0 = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';
const SOL0 = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
const STRANGER = '0x1111111111111111111111111111111111111111';
const PAID = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const LOOKALIKE = `0xd8dA${'0'.repeat(32)}6045`;
const PW = 'Plage-Orange-47!';
const ETH_FEE = 21_000n * 30n * 10n ** 9n;

function area(): StorageArea & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = {};
  return {
    data,
    async get(keys) { return Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, structuredClone(data[k])])); },
    async set(items) { Object.assign(data, structuredClone(items)); },
    async remove(keys) { for (const k of keys) delete data[k]; },
  };
}

/** Adaptateur simulé : mêmes contrats que les v2 du cœur, sans réseau. Note qui a signé. */
function fakeAdapter(config: ChainConfig, log: { signedBy?: string; broadcasts: number; requests: SendRequest[] }): ChainAdapterV2 {
  const evm = config.family === 'evm';
  const quote = (gwei: bigint) => ({ cost: 21_000n * gwei * 10n ** 9n, opaque: { maxFeePerGas: gwei * 10n ** 9n, maxPriorityFeePerGas: 10n ** 9n } });
  return {
    config,
    capabilities: {} as never,
    signerCurve: evm ? 'secp256k1' : 'ed25519',
    deriveAccount: () => { throw new Error('non utilisé'); },
    validateAddress: (a) => (evm ? /^0x[0-9a-fA-F]{40}$/.test(a) : /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a)),
    getBalance: async () => ({ raw: 10n ** 18n, formatted: '1', symbol: config.nativeSymbol, decimals: config.nativeDecimals }) as never,
    getHistory: async () => [],
    quoteFees: async () => ({ slow: quote(20n), normal: quote(30n), fast: quote(40n) }),
    prepareSend: async (from, req) => {
      log.requests.push(req);
      return { chainId: config.id, from, to: req.to, amount: req.amount, token: req.token ?? null, fee: ETH_FEE, warnings: [], payload: { to: req.to, data: '0x', chainId: config.evmChainId, gasLimit: 21_000n, value: req.amount, maxFeePerGas: 30n * 10n ** 9n, maxPriorityFeePerGas: 10n ** 9n } } as SendDraft;
    },
    signSend: async (draft, s: ChainSigner) => {
      log.signedBy = s.curve === 'secp256k1' ? evmAccountFromPrivateKey(`0x${bytesToHex(s.privateKey)}`).address : base58.encode(s.publicKey);
      return { chainId: draft.chainId, raw: '0xsigned', draft };
    },
    broadcastSend: async () => (log.broadcasts++, { txid: `0x${'ab'.repeat(32)}` }),
    waitForTx: async () => ({ status: 'confirmed' }),
  };
}

const holding = (chainId: string, symbol: string, raw: bigint, decimals: number): Holding => ({
  id: `${chainId}:native`, chainId, kind: 'native', symbol, name: symbol, decimals, raw, amount: Number(raw) / 10 ** decimals, price: 1, fiat: 1, change24h: null, verified: true,
});

let disk: ReturnType<typeof area>;
let session: ReturnType<typeof makeSession>;
let wallets: ReturnType<typeof makeWallets>;
let chainMs: number | null;
let log: { signedBy?: string; broadcasts: number; requests: SendRequest[] };
let send: ReturnType<typeof makeSend>;
let whitelist: ReturnType<typeof makeWhitelist>;
let home: ReturnType<typeof makeHome>;
let clock: number;
let history: TxSummary[];
let portfolio: ReturnType<typeof makePortfolio>;

beforeEach(async () => {
  disk = area();
  clock = 1_700_000_000_000;
  chainMs = 1_700_000_000_000;
  history = [];
  log = { broadcasts: 0, requests: [] };
  session = makeSession({ disk: makeStore(disk), session: makeStore(area()), alarms: { create() {}, clear() {} }, kdf: { N: 1 << 10, r: 8, p: 1 } });
  wallets = makeWallets(makeStore(disk), session);
  portfolio = makePortfolio({
    disk: makeStore(disk), t: activityT, locale: 'fr-FR', now: () => clock,
    load: async () => [holding('ethereum', 'ETH', 10n ** 18n, 18), holding('solana', 'SOL', 2n * 10n ** 9n, 9)],
    history: async (c) => history.filter((t) => t.chain === c),
  });
  home = makeHome(makeStore(disk), session, wallets, portfolio, 'eur');
  whitelist = makeWhitelist(makeStore(disk), session, wallets, async () => chainMs);
  send = makeSend({ session, wallets, home, portfolio, whitelist, now: () => clock, adapterFor: (c) => fakeAdapter(c, log), resolveEns: async (n) => (n === 'vitalik.eth' ? PAID : null) });
  await session.create(PW);
  await wallets.importPhrase(ABOUT);
  await home.refresh();
});

const prep = (to: string, extra: Record<string, unknown> = {}) => send.prepare({ assetKey: 'ethereum:native', to, amount: '0.1', ...extra });

describe('envoyer', () => {
  test('EVM : la clé tirée du coffre signe pour l’adresse affichée ; brouillon à usage unique', async () => {
    const d = await prep(STRANGER);
    expect(d.from).toBe(EVM0);
    expect(d.amountFmt).toBe('0.1');
    expect(d.newRecipient).toBe(true);
    const r = await send.confirm(d.id);
    expect(log.signedBy).toBe(EVM0);
    expect(r.explorer).toBe(`https://etherscan.io/tx/0x${'ab'.repeat(32)}`);
    await expect(send.confirm(d.id)).rejects.toThrow('Brouillon expiré');
    expect(log.broadcasts).toBe(1);
  });

  test('Solana : signataire ed25519 du même compte que l’adresse affichée', async () => {
    const d = await send.prepare({ assetKey: 'solana:native', to: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', amount: '0.5' });
    expect(d.from).toBe(SOL0);
    await send.confirm(d.id);
    expect(log.signedBy).toBe(SOL0);
  });

  test('« Max » : solde moins les frais du palier choisi', async () => {
    await send.prepare({ assetKey: 'ethereum:native', to: STRANGER, amount: '', max: true, speed: 'fast' });
    expect(log.requests.at(-1)!.amount).toBe(10n ** 18n - 21_000n * 40n * 10n ** 9n);
  });

  test('montant invalide, adresse invalide : refusés avant tout brouillon', async () => {
    await expect(prep(STRANGER, { amount: '1,2,3' })).rejects.toThrow();
    await expect(prep('0x123')).rejects.toThrow('Adresse invalide');
    expect(log.requests.length).toBe(0);
  });

  test('ENS résolu ; nom inconnu refusé', async () => {
    const d = await prep('vitalik.eth');
    expect(d.to).toBe(PAID);
    expect(d.ens).toBe('vitalik.eth');
    await expect(prep('inconnu.eth')).rejects.toThrow('ENS_NOT_FOUND');
  });

  test('frais manuels : bornés (≤ 5 × Rapide), priorité ≤ maximum', async () => {
    await expect(prep(STRANGER, { manual: { maxFeeGwei: '500', priorityGwei: '1' } })).rejects.toThrow('MANUAL_FEE_TOO_HIGH');
    await expect(prep(STRANGER, { manual: { maxFeeGwei: '10', priorityGwei: '20' } })).rejects.toThrow('MANUAL_FEE_INVALID');
    const d = await prep(STRANGER, { manual: { maxFeeGwei: '50', priorityGwei: '2' } });
    expect(d.fee).toBe((21_000n * 50n * 10n ** 9n).toString());
  });

  test('sosie d’une adresse déjà payée : danger, signature refusée sans accord explicite', async () => {
    history = [{ chain: 'ethereum', hash: '0x01', from: EVM0, to: PAID, value: 10n ** 17n, timestamp: 1_700_000_000, direction: 'out', status: 'success' }];
    await home.activity(true);
    const exact = await prep(PAID);
    expect(exact.poisoning).toBeUndefined();
    expect(exact.newRecipient).toBe(false);
    const d = await prep(LOOKALIKE);
    expect(d.poisoning?.similarTo).toBe(PAID);
    await expect(send.confirm(d.id)).rejects.toThrow('RISK_NOT_ACCEPTED');
    expect(log.broadcasts).toBe(0);
    const again = await prep(LOOKALIKE);
    await send.confirm(again.id, true);
    expect(log.broadcasts).toBe(1);
  });

  test('brouillon périmé après 2 minutes', async () => {
    const d = await prep(STRANGER);
    clock += 121_000;
    await expect(send.confirm(d.id)).rejects.toThrow('Brouillon expiré');
  });

  test('compte changé entre la préparation et la signature : refus', async () => {
    const d = await prep(STRANGER);
    await wallets.addAccounts((await wallets.list())[0].id, [1]);
    await home.select((await wallets.list())[0].id, 1);
    await expect(send.confirm(d.id)).rejects.toThrow('Compte changé');
  });

  test('clé EVM importée : signe avec elle ; pas de Solana proposé', async () => {
    const pk = deriveEvmAccount(mnemonicToSeedSync('legal winner thank year wave sausage worth useful legal winner thank yellow'), 0).privateKey;
    const w = await wallets.importKey(pk, 'evm');
    await home.select(w.id, 0);
    await home.refresh();
    const assets = await send.assets();
    expect(assets.every((a) => a.family === 'evm')).toBe(true);
    const d = await prep(STRANGER);
    await send.confirm(d.id);
    expect(log.signedBy).toBe(w.accounts[0].evm);
  });

  test('verrouillé : rien ne se signe', async () => {
    const d = await prep(STRANGER);
    await session.lock();
    await expect(send.confirm(d.id)).rejects.toThrow();
    expect(log.broadcasts).toBe(0);
  });
});

describe('Bitcoin', () => {
  const BTC0 = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';
  const DEST = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
  /** Réseau Bitcoin simulé : pièces et taux fixes, diffusion notée. La signature, elle, est la vraie. */
  function btcNet(utxos: { txid: string; vout: number; value: number }[]) {
    const v1 = new BitcoinChainAdapter(BITCOIN);
    const out = { hex: '' };
    Object.assign(v1, {
      getFeeRates: async () => ({ slow: 2, normal: 5, fast: 10 }),
      confirmedUtxos: async () => utxos,
      broadcastHex: async (hex: string) => ((out.hex = hex), 'f'.repeat(64)),
    });
    return { adapter: new BitcoinAdapterV2(BITCOIN, v1), out };
  }
  const btcSend = (a: BitcoinAdapterV2) => {
    const pf = makePortfolio({ disk: makeStore(disk), t: activityT, locale: 'fr-FR', now: () => clock, load: async () => [holding('bitcoin', 'BTC', 200_000n, 8)], history: async () => [] });
    const h = makeHome(makeStore(disk), session, wallets, pf, 'eur');
    return { s: makeSend({ session, wallets, home: h, portfolio: pf, whitelist, now: () => clock, adapterFor: (c) => (c.family === 'bitcoin' ? a : fakeAdapter(c, log)) }), h };
  };

  test('envoi : vraie transaction signée par la clé du compte bc1 affiché, vers le bon destinataire', async () => {
    const { adapter, out } = btcNet([{ txid: 'a'.repeat(64), vout: 0, value: 200_000 }]);
    const { s, h } = btcSend(adapter);
    await h.refresh();
    expect((await s.assets()).some((x) => x.key === 'bitcoin:native' && x.family === 'bitcoin')).toBe(true);
    const d = await s.prepare({ assetKey: 'bitcoin:native', to: DEST, amount: '0.0005' });
    expect(d.from).toBe(BTC0);
    expect(d.amount).toBe('50000');
    const r = await s.confirm(d.id);
    expect(r.explorer).toBe(`https://mempool.space/tx/${'f'.repeat(64)}`);
    const { Transaction, OutScript, Address, NETWORK } = await import('@scure/btc-signer');
    const tx = Transaction.fromRaw(Buffer.from(out.hex, 'hex'), { allowUnknownOutputs: true });
    const outs = Array.from({ length: tx.outputsLength }, (_, i) => tx.getOutput(i));
    const addr = (o: (typeof outs)[number]) => Address(NETWORK).encode(OutScript.decode(o.script!));
    expect(outs.map(addr)).toContain(DEST);
    expect(outs.find((o) => addr(o) === DEST)!.amount).toBe(50_000n);
    // La monnaie revient au compte ; la clé publique du témoin est celle de BTC0.
    expect(outs.map(addr)).toContain(BTC0);
    const witnessKey = tx.getInput(0).finalScriptWitness![1];
    expect(p2wpkhAddress(witnessKey)).toBe(BTC0);
  });

  test('« Max » Bitcoin : calculé par l’adaptateur (pièces et frais réels)', async () => {
    const { adapter } = btcNet([{ txid: 'a'.repeat(64), vout: 0, value: 120_000 }, { txid: 'b'.repeat(64), vout: 1, value: 80_000 }]);
    const { s, h } = btcSend(adapter);
    await h.refresh();
    const d = await s.prepare({ assetKey: 'bitcoin:native', to: DEST, amount: '', max: true });
    const m = await adapter.maxSendable(BTC0, DEST, 'normal');
    expect(d.amount).toBe(m.amount.toString());
    expect(BigInt(d.amount) + BigInt(d.fee)).toBe(200_000n);
  });

  test('poussière refusée avec le minimum ; adresse invalide refusée', async () => {
    const { adapter } = btcNet([{ txid: 'a'.repeat(64), vout: 0, value: 200_000 }]);
    const { s, h } = btcSend(adapter);
    await h.refresh();
    await expect(s.prepare({ assetKey: 'bitcoin:native', to: DEST, amount: '0.000001' })).rejects.toThrow('BTC_DUST');
    await expect(s.prepare({ assetKey: 'bitcoin:native', to: 'bc1qnotanaddress', amount: '0.001' })).rejects.toThrow('Adresse invalide');
  });

  test('liste blanche : une adresse bc1 en majuscules est la même adresse', async () => {
    expect(addressKey(DEST.toUpperCase())).toBe(addressKey(DEST));
  });
});

describe('TON', () => {
  const DEST = 'UQC020bHeiUqqyw8BB4EttblmRidKkT_hnINJ-8rZCP0L1Dw';
  const EXCHANGE = 'UQAfPZl7MGtsMq_nRY6UyeWh9e0qs8Vj5ToOcCI-vTPvM_xm';
  const TON_FEE = 3_000_000n;
  /** Réseau TON simulé : mêmes contrats que TonAdapterV2 (commentaire exigé par une plateforme, frais dans le brouillon). */
  function tonNet() {
    const out: { reqs: SendRequest[]; signedBy?: string; comment?: string } = { reqs: [] };
    const a: ChainAdapterV2 = {
      config: TON,
      capabilities: {} as never,
      signerCurve: 'ed25519',
      deriveAccount: () => { throw new Error('non utilisé'); },
      validateAddress: (x) => isValidTonAddress(x),
      getBalance: async () => ({ raw: 2n * 10n ** 9n }) as never,
      getHistory: async () => [],
      prepareSend: async (from, req) => {
        out.reqs.push(req);
        const warnings = req.to === EXCHANGE && !req.memo?.trim() ? [{ code: 'MEMO_REQUIRED', severity: 'danger' }] : [];
        return { chainId: 'ton', from, to: req.to, amount: req.amount, token: null, fee: TON_FEE, warnings, payload: { comment: req.memo } } as unknown as SendDraft;
      },
      signSend: async (draft, sg: ChainSigner) => {
        out.signedBy = addressForChain({ evmAddress: '', tonPublicKey: bytesToHex(sg.publicKey) }, TON);
        out.comment = (draft.payload as { comment?: string }).comment;
        return { chainId: 'ton', raw: 'boc', draft };
      },
      broadcastSend: async () => ({ txid: 'c'.repeat(64) }),
      waitForTx: async () => ({ status: 'confirmed' }),
    };
    return { a, out };
  }
  const tonSend = (a: ChainAdapterV2) => {
    const pf = makePortfolio({ disk: makeStore(disk), t: activityT, locale: 'fr-FR', now: () => clock, load: async () => [holding('ton', 'TON', 2n * 10n ** 9n, 9)], history: async () => [] });
    const h = makeHome(makeStore(disk), session, wallets, pf, 'eur');
    return { s: makeSend({ session, wallets, home: h, portfolio: pf, whitelist, now: () => clock, adapterFor: (c) => (c.family === 'ton' ? a : fakeAdapter(c, log)) }), h };
  };

  test('envoi : signé par la clé du compte UQ affiché, commentaire transmis tel quel', async () => {
    const { a, out } = tonNet();
    const { s, h } = tonSend(a);
    await h.refresh();
    expect((await s.assets()).some((x) => x.key === 'ton:native' && x.family === 'ton')).toBe(true);
    const d = await s.prepare({ assetKey: 'ton:native', to: DEST, amount: '0.5', memo: '  dépôt 4412  ' });
    expect(d.from).toMatch(/^UQ/);
    expect(d.amount).toBe('500000000');
    expect(d.memo).toBe('dépôt 4412');
    expect(out.reqs[0].memo).toBe('dépôt 4412');
    await s.confirm(d.id);
    expect(out.signedBy).toBe(d.from);
    expect(out.comment).toBe('dépôt 4412');
  });

  test('plateforme qui exige un commentaire : refus sans, accepté avec', async () => {
    const { a } = tonNet();
    const { s, h } = tonSend(a);
    await h.refresh();
    await expect(s.prepare({ assetKey: 'ton:native', to: EXCHANGE, amount: '0.1' })).rejects.toThrow('Commentaire exigé');
    await expect(s.prepare({ assetKey: 'ton:native', to: EXCHANGE, amount: '0.1', memo: '   ' })).rejects.toThrow('Commentaire exigé');
    expect((await s.prepare({ assetKey: 'ton:native', to: EXCHANGE, amount: '0.1', memo: '777' })).memo).toBe('777');
  });

  test('« Max » TON : solde moins les frais du brouillon d’essai et 10 % de marge', async () => {
    const { a } = tonNet();
    const { s, h } = tonSend(a);
    await h.refresh();
    const d = await s.prepare({ assetKey: 'ton:native', to: DEST, amount: '', max: true });
    expect(BigInt(d.amount)).toBe(2n * 10n ** 9n - TON_FEE - TON_FEE / 10n);
  });

  test('adresse EVM refusée ; commentaire trop long refusé par le routeur', async () => {
    const { a } = tonNet();
    const { s, h } = tonSend(a);
    await h.refresh();
    await expect(s.prepare({ assetKey: 'ton:native', to: PAID, amount: '0.1' })).rejects.toThrow('Adresse invalide');
    const r = await handleInternal(session, wallets, { type: 'send:prepare', assetKey: 'ton:native', to: DEST, amount: '0.1', memo: 'x'.repeat(121) }, undefined, { send: s });
    expect(r).toMatchObject({ ok: false, error: 'BAD_REQUEST' });
  });

  test('liste blanche : formes EQ et UQ de la même adresse TON = une seule clé', async () => {
    const eq = formatTonAddress(parseTonAddress(DEST)!, { bounceable: true });
    expect(eq.startsWith('EQ')).toBe(true);
    expect(addressKey(eq)).toBe(addressKey(DEST));
  });
});

describe('mode compagnon', () => {
  test('compte du téléphone : le brouillon contrôlé ici part au téléphone, aucune clé locale, aucune diffusion ici', async () => {
    const phone = evmAccountFromPrivateKey(`0x${'33'.repeat(32)}`).address;
    const calls: { chainId: string; method: string; params: unknown }[] = [];
    const companion = {
      request: async (_m: unknown, chainId: string, method: string, params: unknown) => (calls.push({ chainId, method, params }), `0x${'cd'.repeat(32)}`),
    } as unknown as Companion;
    const [w] = await wallets.addCompanion({ topic: 't1', wallets: [{ key: 'phone', label: '', accounts: [{ index: 0, label: 'Compte 1', evm: phone }] }], evmChains: [1, 8453], label: 'Téléphone' });
    await home.select(w.id, 0);
    const s2 = makeSend({ session, wallets, home, portfolio, whitelist, now: () => clock, adapterFor: (c) => fakeAdapter(c, log), resolveEns: async () => null, companion });
    const d = await s2.prepare({ assetKey: 'ethereum:native', to: STRANGER, amount: '0.1' });
    expect(d.from).toBe(phone);
    expect(d.onPhone).toBe(true);
    const r = await s2.confirm(d.id);
    expect(r.txid).toBe(`0x${'cd'.repeat(32)}`);
    expect(calls).toEqual([{ chainId: 'eip155:1', method: 'eth_sendTransaction', params: [{ from: phone, to: STRANGER, data: '0x', value: '0x16345785d8a0000', gas: '0x5208' }] }]);
    expect(log.signedBy).toBeUndefined();
    expect(log.broadcasts).toBe(0);
  });

  test('Bitcoin du téléphone : destinataire et montant EN SATOSHIS partent au téléphone, txid contrôlé', async () => {
    const phoneBtc = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
    const DEST = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';
    const calls: { chainId: string; method: string; params: unknown }[] = [];
    const companion = { request: async (_m: unknown, chainId: string, method: string, params: unknown) => (calls.push({ chainId, method, params }), { txid: 'E'.repeat(64) }) } as unknown as Companion;
    const v1 = new BitcoinChainAdapter(BITCOIN);
    Object.assign(v1, { getFeeRates: async () => ({ slow: 2, normal: 5, fast: 10 }), confirmedUtxos: async () => [{ txid: 'a'.repeat(64), vout: 0, value: 200_000 }], broadcastHex: async () => { throw new Error('jamais diffusé ici'); } });
    const pf = makePortfolio({ disk: makeStore(disk), t: activityT, locale: 'fr-FR', now: () => clock, load: async () => [holding('bitcoin', 'BTC', 200_000n, 8)], history: async () => [] });
    const h = makeHome(makeStore(disk), session, wallets, pf, 'eur');
    const [w] = await wallets.addCompanion({ topic: 't-btc', wallets: [{ key: 'phone', label: '', accounts: [{ index: 0, label: 'Compte 1', bitcoin: phoneBtc }] }], evmChains: [], label: 'Téléphone' });
    await h.select(w.id, 0);
    await h.refresh();
    const s2 = makeSend({ session, wallets, home: h, portfolio: pf, whitelist, now: () => clock, adapterFor: (c) => (c.family === 'bitcoin' ? new BitcoinAdapterV2(BITCOIN, v1) : fakeAdapter(c, log)), companion });
    const d = await s2.prepare({ assetKey: 'bitcoin:native', to: DEST, amount: '0.0005' });
    expect(d.from).toBe(phoneBtc);
    expect(d.onPhone).toBe(true);
    const r = await s2.confirm(d.id);
    expect(r.txid).toBe('e'.repeat(64));
    expect(calls).toEqual([{ chainId: BTC_CAIP, method: 'sendTransfer', params: { account: phoneBtc, recipientAddress: DEST, amount: '50000' } }]);
  });

  test('compte local : rien ne part au téléphone', async () => {
    const d = await prep(STRANGER);
    expect(d.onPhone).toBeUndefined();
  });
});

describe('liste blanche', () => {
  test('active : inconnu bloqué, ses propres comptes permis', async () => {
    await whitelist.enable();
    await expect(prep(STRANGER)).rejects.toThrow('liste blanche');
    const own = await wallets.create();
    void own;
    const w = (await wallets.list())[0];
    await expect(prep(w.accounts[0].evm!)).resolves.toBeTruthy();
  });

  test('adresse ajoutée sous protection : utilisable après 24 h D’HEURE DE CHAÎNE', async () => {
    await whitelist.enable();
    const v = await whitelist.add(STRANGER, 'Ami');
    expect(v.entries[0]).toMatchObject({ active: false, hoursLeft: 24 });
    await expect(prep(STRANGER)).rejects.toThrow('délai');
    clock += 25 * 3600_000; // l'heure de l'ordinateur n'y change rien
    await expect(prep(STRANGER)).rejects.toThrow('délai');
    chainMs = chainMs! + 24 * 3600_000;
    clock = 1_700_000_000_000;
    await expect(prep(STRANGER)).resolves.toBeTruthy();
  });

  test('heure de chaîne inconnue : impossible d’ajouter sous protection', async () => {
    await whitelist.enable();
    chainMs = null;
    await expect(whitelist.add(STRANGER, '')).rejects.toThrow('Heure de chaîne');
  });

  test('désactivation : effective seulement 24 h après la demande', async () => {
    await whitelist.enable();
    await whitelist.requestDisable();
    await expect(prep(STRANGER)).rejects.toThrow('liste blanche');
    chainMs = chainMs! + 24 * 3600_000 + 1;
    expect((await whitelist.get()).enabled).toBe(false);
    await expect(prep(STRANGER)).resolves.toBeTruthy();
  });

  test('vérifiée aussi au moment de signer (activée après la préparation)', async () => {
    const d = await prep(STRANGER);
    await whitelist.enable();
    await expect(send.confirm(d.id)).rejects.toThrow('liste blanche');
    expect(log.broadcasts).toBe(0);
  });

  test('état modifié sur le disque : ne s’ouvre plus → traité comme ACTIF et vide', async () => {
    await whitelist.add(STRANGER, 'Ami'); // protection éteinte : utilisable tout de suite
    const sealed = disk.data['kalyx.whitelist'] as { ct: string };
    sealed.ct = sealed.ct.replace(/^./, (c) => (c === 'a' ? 'b' : 'a'));
    await expect(prep(STRANGER)).rejects.toThrow('liste blanche');
  });

  test('rien de lisible en clair sur le disque', async () => {
    await whitelist.add(STRANGER, 'Ami');
    expect(JSON.stringify(disk.data)).not.toContain(STRANGER.toLowerCase().slice(2, 12));
  });
});

describe('phrase à vérifier plus tard', () => {
  test('mot de passe REDEMANDÉ, même déverrouillé ; freiné comme le déverrouillage', async () => {
    const { id } = await wallets.create();
    const bad = await handleInternal(session, wallets, { type: 'wallet:reveal-phrase', id, password: 'faux-mot-de-passe' });
    expect(bad).toMatchObject({ ok: false, error: 'WRONG_PASSWORD' });
    const good = await handleInternal(session, wallets, { type: 'wallet:reveal-phrase', id, password: PW });
    expect(good.ok && (good.phrase as string).split(' ')).toHaveLength(12);
  });
});

describe('gérer les portefeuilles (routes)', () => {
  test('clé privée et sauvegarde : mot de passe redemandé, verrouillées par la liste blanche', async () => {
    const { id } = await wallets.create();
    expect(await handleInternal(session, wallets, { type: 'wallet:reveal-key', id, index: 0, family: 'evm', password: 'faux-mot-de-passe' })).toMatchObject({ ok: false, error: 'WRONG_PASSWORD' });
    const ok = await handleInternal(session, wallets, { type: 'wallet:reveal-key', id, index: 0, family: 'evm', password: PW }, undefined, { whitelist });
    expect(ok.ok && ok.key).toMatch(/^0x[0-9a-f]{64}$/);
    await whitelist.enable();
    expect(await handleInternal(session, wallets, { type: 'wallet:reveal-key', id, index: 0, family: 'evm', password: PW }, undefined, { whitelist })).toMatchObject({ ok: false, error: 'WHITELIST_LOCKED' });
    expect(await handleInternal(session, wallets, { type: 'wallet:export-backup', password: PW, backupPassword: 'Sauvegarde-Solide-93!' }, undefined, { whitelist })).toMatchObject({ ok: false, error: 'WHITELIST_LOCKED' });
  });

  test('sauvegarde : mot de passe faible ou identique à celui du coffre refusé', async () => {
    await wallets.create();
    expect(await handleInternal(session, wallets, { type: 'wallet:export-backup', password: PW, backupPassword: '1234' })).toMatchObject({ ok: false, error: 'WEAK_BACKUP_PASSWORD' });
    expect(await handleInternal(session, wallets, { type: 'wallet:export-backup', password: PW, backupPassword: PW })).toMatchObject({ ok: false, error: 'WEAK_BACKUP_PASSWORD' });
    const r = await handleInternal(session, wallets, { type: 'wallet:export-backup', password: PW, backupPassword: 'Sauvegarde-Solide-93!' });
    expect(r.ok && r.count).toBe((await wallets.list()).filter((w) => w.kind !== 'companion').length);
  });

  test('supprimer : mot de passe exigé ; ajouter un compte le sélectionne', async () => {
    const { id } = await wallets.create();
    expect(await handleInternal(session, wallets, { type: 'wallet:remove', id, password: 'faux-mot-de-passe' })).toMatchObject({ ok: false, error: 'WRONG_PASSWORD' });
    expect(await handleInternal(session, wallets, { type: 'wallet:add-account', id }, undefined, { home })).toMatchObject({ ok: true, index: 1 });
    expect((await home.current())?.index).toBe(1);
    expect(await handleInternal(session, wallets, { type: 'wallet:remove', id, password: PW })).toMatchObject({ ok: true });
    expect((await wallets.list()).some((w) => w.id === id)).toBe(false);
  });
});
