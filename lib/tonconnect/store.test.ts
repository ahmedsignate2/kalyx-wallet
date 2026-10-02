/**
 * TON Connect de bout en bout, côté wallet, contre une FAUSSE dApp qui a ses
 * propres clés : chaque réponse est déchiffrée et vérifiée comme le ferait le
 * SDK officiel. Le pont est simulé (capturé), le réseau TON aussi (réponses
 * TonAPI relevées).
 */
import { base64, hex } from '@scure/base';
import { ed25519 } from '@noble/curves/ed25519';
import { Cell, loadMessage, contractAddress, loadStateInit } from '@ton/core';

const sent: { bridge: string; from: string; to: string; body: string }[] = [];
let onMessage: ((m: { from: string; message: string; eventId?: string }) => void) | null = null;
jest.mock('./bridge', () => ({
  BridgeListener: class {
    constructor(_b: string, _ids: string[], _last: string | undefined, cb: typeof onMessage) { onMessage = cb; }
    start() {}
    stop() {}
  },
  bridgeSend: async (bridge: string, from: string, to: string, body: string) => { sent.push({ bridge, from, to, body }); },
}));
const kv = new Map<string, string>();
jest.mock('../kv', () => ({ kvGet: async (k: string) => kv.get(k) ?? null, kvSet: async (k: string, v: string) => void kv.set(k, v), kvDel: async (k: string) => void kv.delete(k) }));
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.0.0' } } }));
jest.mock('../whitelistStore', () => ({ assertDappAllowed: async () => {} }));
jest.mock('../technicalLogger', () => ({ technicalLogger: { logDapp: () => {} } }));

import KEYS from '../../src/domain/chains/ton/tonkeeper-vectors.json';
import LIVE from '../../src/domain/chains/ton/tonapi-live.json';
const art = KEYS.keys.find((k) => k.phrase.endsWith(' art'))!;

jest.mock('../walletStore', () => {
  const { hex: h } = require('@scure/base');
  const K = require('../../src/domain/chains/ton/tonkeeper-vectors.json');
  const a = K.keys.find((k: { phrase: string }) => k.phrase.endsWith(' art'));
  const state = {
    activeChain: 'ton',
    activeWalletId: 'w1',
    activeAccountIndex: 0,
    accounts: [{ index: 0, label: '', evmAddress: '', btcAddress: '', tonPublicKey: a.publicKey, tonVersion: 'v5r1' }],
    deriveSigner: async () => ({ curve: 'ed25519', secretKey: h.decode(a.seed + a.publicKey), publicKey: h.decode(a.publicKey) }),
  };
  return { useWallet: { getState: () => state } };
});

// Réseau TON simulé : TonAPI relevé, diffusion capturée.
const broadcasts: string[] = [];
jest.mock('../../src', () => {
  const actual = jest.requireActual('../../src');
  const { TonAdapterV2 } = jest.requireActual('../../src/domain/chains/v2/TonAdapterV2');
  const { TonApiClient } = jest.requireActual('../../src/domain/chains/ton/tonApi');
  const L = require('../../src/domain/chains/ton/tonapi-live.json');
  const K = require('../../src/domain/chains/ton/tonkeeper-vectors.json');
  const A = K.keys.find((k: { phrase: string }) => k.phrase.endsWith(' art')).v5r1.uq;
  const api = new TonApiClient('https://p/n', async (u: string, i?: { method?: string; body?: string }) => {
    const path = decodeURIComponent(u.replace('https://p/n', ''));
    if (path === `/v2/accounts/${A}`) return { status: 200, text: async () => JSON.stringify({ ...L.accountActiveW5, balance: 1_000_000_000 }) };
    if (path === `/v2/wallet/${A}/seqno`) return { status: 200, text: async () => '{"seqno":5}' };
    if (path === '/v2/wallet/emulate') return (globalThis as { __emuDown?: boolean }).__emuDown ? { status: 503, text: async () => '{}' } : { status: 200, text: async () => JSON.stringify(L.emulateV3) };
    if (path === '/v2/blockchain/message') { broadcasts.push(JSON.parse(i!.body!).boc); return { status: 200, text: async () => '{}' }; }
    return { status: 404, text: async () => '{}' };
  });
  const cfg = actual.listChains({ includeTestnets: false }).find((c: { id: string }) => c.id === 'ton');
  const ton = new TonAdapterV2(cfg, { api, now: () => 1_790_000_000_000 });
  return { ...actual, getAdapterV2: () => ton };
});

import { useTonConnect } from './store';
import { decryptMessage, encryptMessage, newSessionKeyPair } from '../../src/domain/tonconnect/sessionCrypto';
import { tonProofDigest, tonProofMessage } from '../../src/domain/tonconnect/tonProof';

const dapp = newSessionKeyPair();
const MANIFEST = { url: 'https://app.ston.fi', name: 'STON.fi', iconUrl: 'https://static.ston.fi/logo.png' };
const link = `https://app.tonkeeper.com/ton-connect?v=2&id=${dapp.publicKey}&r=${encodeURIComponent(JSON.stringify({ manifestUrl: 'https://app.ston.fi/tonconnect-manifest.json', items: [{ name: 'ton_addr' }, { name: 'ton_proof', payload: 'nonce-123' }] }))}&ret=none`;

/** Ce que la dApp lit : déchiffré avec SA clé, à partir de la clé de session du wallet. */
const read = (i: number) => JSON.parse(decryptMessage(base64.decode(sent[i].body), sent[i].from, dapp.secretKey));

beforeAll(() => {
  global.fetch = (async () => ({ ok: true, json: async () => MANIFEST })) as never;
});

describe('TON Connect, du QR à la transaction', () => {
  it('connexion : ton_addr + ton_proof valides, sur le pont de Tonkeeper', async () => {
    expect(await useTonConnect.getState().openLink(link)).toBeNull();
    expect(useTonConnect.getState().queue[0]).toMatchObject({ kind: 'connect', domain: 'app.ston.fi' });
    await useTonConnect.getState().approveConnect({ pin: '000000' } as never);

    expect(sent).toHaveLength(1);
    expect(sent[0].bridge).toBe('https://bridge.tonapi.io/bridge');
    const ev = read(0);
    expect(ev.event).toBe('connect');
    expect(ev.payload.device).toMatchObject({ appName: 'kalyx', maxProtocolVersion: 2 });
    const addr = ev.payload.items.find((i: { name: string }) => i.name === 'ton_addr');
    expect(addr).toMatchObject({ address: art.v5r1.raw, network: '-239', publicKey: art.publicKey });
    // Ce que vérifie un serveur de dApp (spec) : l'état initial redonne l'adresse…
    expect(contractAddress(0, loadStateInit(Cell.fromBase64(addr.walletStateInit).beginParse())).toRawString()).toBe(art.v5r1.raw);
    // … et la signature de la preuve est valide pour cette clé.
    const proof = ev.payload.items.find((i: { name: string }) => i.name === 'ton_proof').proof;
    const digest = tonProofDigest(tonProofMessage(art.v5r1.raw, 'app.ston.fi', proof.timestamp, 'nonce-123'));
    expect(ed25519.verify(base64.decode(proof.signature), digest, hex.decode(art.publicKey))).toBe(true);
    expect(useTonConnect.getState().sessions).toHaveLength(1);
  });

  it('transaction : mise en file, émulée, signée par le bon compte, diffusée et rendue', async () => {
    const session = useTonConnect.getState().sessions[0];
    const req = { method: 'sendTransaction', id: '7', params: [JSON.stringify({ valid_until: Math.floor(Date.now() / 1000) + 300, network: '-239', from: art.v5r1.raw, messages: [{ address: KEYS.keys[4].v4r2.eq, amount: '10000000' }] })] };
    onMessage!({ from: dapp.publicKey, message: base64.encode(encryptMessage(JSON.stringify(req), session.keyPair.publicKey, dapp.secretKey)) });
    await new Promise((r) => setTimeout(r, 20));
    const pending = useTonConnect.getState().queue[0];
    expect(pending).toMatchObject({ kind: 'tx', requestId: '7' });
    expect(pending.kind === 'tx' && pending.draft?.emulation?.fee).toBe(372496n);

    await useTonConnect.getState().approveTx({ pin: '000000' } as never);
    expect(broadcasts).toHaveLength(1);
    const reply = read(1);
    expect(reply).toEqual({ result: broadcasts[0], id: '7' });
    // Le BOC rendu est un message externe vers NOTRE portefeuille.
    const msg = loadMessage(Cell.fromBase64(reply.result).beginParse());
    expect(msg.info.dest?.toString()).toBe(require('@ton/core').Address.parse(art.v5r1.raw).toString());
  });

  it('émulation indisponible : un transfert de jetons caché dans les données n’est jamais signé', async () => {
    const { beginCell, Address } = require('@ton/core');
    const session = useTonConnect.getState().sessions[0];
    const jet = beginCell().storeUint(0x0f8a7ea5, 32).storeUint(1, 64).storeCoins(10n ** 12n).storeAddress(Address.parse(KEYS.keys[4].v4r2.eq)).storeAddress(Address.parse(KEYS.keys[4].v4r2.eq)).storeBit(0).storeCoins(1n).storeBit(0).endCell();
    (globalThis as { __emuDown?: boolean }).__emuDown = true;
    try {
      const req = { method: 'sendTransaction', id: '9', params: [JSON.stringify({ valid_until: Math.floor(Date.now() / 1000) + 300, messages: [{ address: KEYS.keys[4].v4r2.eq, amount: '50000000', payload: jet.toBoc().toString('base64') }] })] };
      onMessage!({ from: dapp.publicKey, message: base64.encode(encryptMessage(JSON.stringify(req), session.keyPair.publicKey, dapp.secretKey)) });
      await new Promise((r) => setTimeout(r, 20));
      const pending = useTonConnect.getState().queue[0];
      expect(pending.kind === 'tx' && pending.draft?.emulation).toBeNull();
      const before = broadcasts.length;
      await expect(useTonConnect.getState().approveTx({ pin: '000000' } as never)).rejects.toThrow('tcCannotVerify');
      expect(broadcasts.length).toBe(before);
    } finally {
      (globalThis as { __emuDown?: boolean }).__emuDown = false;
      await useTonConnect.getState().rejectTx();
    }
  });

  it('signData : texte signé selon la spécification (vérifiable par la dApp) ; autre réseau ou autre adresse refusés', async () => {
    const { signDataDigest } = require('../../src/domain/tonconnect/signData');
    const { Address } = require('@ton/core');
    const session = useTonConnect.getState().sessions[0];
    const ask = async (id: string, payload: object) => {
      onMessage!({ from: dapp.publicKey, message: base64.encode(encryptMessage(JSON.stringify({ method: 'signData', id, params: [JSON.stringify(payload)] }), session.keyPair.publicKey, dapp.secretKey)) });
      await new Promise((r) => setTimeout(r, 20));
    };
    await ask('20', { type: 'text', text: 'Connexion à STON.fi', network: '-239', from: art.v5r1.raw });
    expect(useTonConnect.getState().queue[0]).toMatchObject({ kind: 'signData', requestId: '20' });
    await useTonConnect.getState().approveSignData({ pin: '000000' } as never);
    const reply = read(sent.length - 1);
    expect(reply.id).toBe('20');
    expect(reply.result).toMatchObject({ address: art.v5r1.raw, domain: 'app.ston.fi', payload: { type: 'text', text: 'Connexion à STON.fi' } });
    const digest = signDataDigest(reply.result.payload, Address.parse(reply.result.address), reply.result.domain, reply.result.timestamp);
    expect(ed25519.verify(base64.decode(reply.result.signature), digest, hex.decode(art.publicKey))).toBe(true);

    await ask('21', { type: 'text', text: 'x', network: '-3' });
    await expect(useTonConnect.getState().approveSignData({ pin: '000000' } as never)).rejects.toThrow('tcSignDataWrongNetwork');
    await useTonConnect.getState().rejectSignData();
    expect(read(sent.length - 1)).toEqual({ error: { code: 300, message: 'User declined the request' }, id: '21' });

    await ask('22', { type: 'text', text: 'x', from: KEYS.keys[4].v4r2.eq });
    await expect(useTonConnect.getState().approveSignData({ pin: '000000' } as never)).rejects.toThrow('tcSignDataWrongAccount');
    await useTonConnect.getState().rejectSignData();

    await ask('23', { type: 'image', data: 'x' });
    expect(read(sent.length - 1)).toEqual({ error: { code: 1, message: 'Bad signData request' }, id: '23' });
  });

  it('refus : code 300 renvoyé à la dApp', async () => {
    const session = useTonConnect.getState().sessions[0];
    const req = { method: 'sendTransaction', id: '8', params: [JSON.stringify({ valid_until: Math.floor(Date.now() / 1000) + 300, messages: [{ address: KEYS.keys[4].v4r2.eq, amount: '1' }] })] };
    onMessage!({ from: dapp.publicKey, message: base64.encode(encryptMessage(JSON.stringify(req), session.keyPair.publicKey, dapp.secretKey)) });
    await new Promise((r) => setTimeout(r, 20));
    await useTonConnect.getState().rejectTx();
    expect(read(sent.length - 1)).toEqual({ error: { code: 300, message: 'User declined the transaction' }, id: '8' });
  });

  it('sous-compte actif : la transaction est refusée avant toute signature', async () => {
    const session = useTonConnect.getState().sessions[0];
    const w = require('../walletStore').useWallet.getState();
    w.accounts.push({ index: 1, label: '', evmAddress: '0x1', btcAddress: '' });
    w.activeAccountIndex = 1;
    const req = { method: 'sendTransaction', id: '11', params: [JSON.stringify({ valid_until: Math.floor(Date.now() / 1000) + 300, messages: [{ address: KEYS.keys[4].v4r2.eq, amount: '1' }] })] };
    onMessage!({ from: dapp.publicKey, message: base64.encode(encryptMessage(JSON.stringify(req), session.keyPair.publicKey, dapp.secretKey)) });
    await new Promise((r) => setTimeout(r, 20));
    const before = broadcasts.length;
    await expect(useTonConnect.getState().approveTx({ pin: '000000' } as never)).rejects.toThrow('tcWrongAccount');
    expect(broadcasts.length).toBe(before);
    w.activeAccountIndex = 0;
    w.accounts.pop();
    await useTonConnect.getState().rejectTx();
  });

  it('méthode inconnue : 400 sans rien montrer ; déconnexion par la dApp : session retirée', async () => {
    const session = useTonConnect.getState().sessions[0];
    const enc = (o: object) => base64.encode(encryptMessage(JSON.stringify(o), session.keyPair.publicKey, dapp.secretKey));
    onMessage!({ from: dapp.publicKey, message: enc({ method: 'signMessage', id: '9', params: ['{}'] }) });
    await new Promise((r) => setTimeout(r, 20));
    expect(read(sent.length - 1)).toMatchObject({ error: { code: 400 }, id: '9' });
    expect(useTonConnect.getState().queue).toHaveLength(0);
    onMessage!({ from: dapp.publicKey, message: enc({ method: 'disconnect', id: '10', params: [] }) });
    await new Promise((r) => setTimeout(r, 20));
    expect(useTonConnect.getState().sessions).toHaveLength(0);
  });

  it('un message d’un inconnu ou indéchiffrable est ignoré', async () => {
    const before = sent.length;
    onMessage?.({ from: 'ab'.repeat(32), message: 'AAAA' });
    await new Promise((r) => setTimeout(r, 10));
    expect(sent.length).toBe(before);
  });
});
