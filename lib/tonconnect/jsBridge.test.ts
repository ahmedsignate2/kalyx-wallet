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
    if (path === '/v2/wallet/emulate') return { status: 200, text: async () => JSON.stringify(L.emulateV3) };
    if (path === '/v2/blockchain/message') { broadcasts.push(JSON.parse(i!.body!).boc); return { status: 200, text: async () => '{}' }; }
    return { status: 404, text: async () => '{}' };
  });
  const cfg = actual.listChains({ includeTestnets: false }).find((c: { id: string }) => c.id === 'ton');
  const ton = new TonAdapterV2(cfg, { api, now: () => 1_790_000_000_000 });
  return { ...actual, getAdapterV2: () => ton };
});

import vm from 'vm';
import { useTonConnect, tcJsHost } from './store';
import { buildTonJsBridge, parseTcJsMessage } from '../../src/domain/tonconnect/jsBridge';
import { tonProofDigest, tonProofMessage } from '../../src/domain/tonconnect/tonProof';

const MANIFEST = { url: 'https://app.ston.fi', name: 'STON.fi', iconUrl: 'https://static.ston.fi/logo.png' };
const REQUEST = { manifestUrl: 'https://app.ston.fi/tonconnect-manifest.json', items: [{ name: 'ton_addr' }, { name: 'ton_proof', payload: 'nonce-js' }] };

/** Ce que la page reçoit : les JS exécutés, et les réponses qu'ils portent. */
const delivered: { host: string; js: string }[] = [];
const answer = (callId: number) => {
  const d = [...delivered].reverse().find((x) => x.js.includes(`__kalyxTcResolve(${callId}, `));
  if (!d) return undefined;
  return JSON.parse(d.js.slice(d.js.indexOf(`(${callId}, `) + `(${callId}, `.length, d.js.lastIndexOf('); true;')));
};

beforeAll(() => {
  global.fetch = (async () => ({ ok: true, json: async () => MANIFEST })) as never;
  tcJsHost.deliver = (host, js) => delivered.push({ host, js });
});

describe('Pont JS : la page détecte Kalyx comme le SDK TON Connect', () => {
  it('window.kalyx.tonconnect est découvrable (walletInfo complet, isWalletBrowser) et parle par postMessage', async () => {
    const posted: string[] = [];
    const win: Record<string, unknown> = { ReactNativeWebView: { postMessage: (m: string) => posted.push(m) } };
    win.window = win;
    vm.runInNewContext(buildTonJsBridge({ appName: 'kalyx', maxProtocolVersion: 2 }), win);
    // Découverte du SDK : un objet de `window` dont `tonconnect.walletInfo` a ces champs.
    const found = Object.entries(win).filter(([, v]) => {
      const w = (v as { tonconnect?: { walletInfo?: Record<string, unknown> } })?.tonconnect?.walletInfo;
      return !!w && ['name', 'app_name', 'image', 'about_url', 'platforms'].every((k) => k in w);
    });
    expect(found.map(([k]) => k)).toEqual(['kalyx']);
    const tc = (win.kalyx as { tonconnect: { isWalletBrowser: boolean; protocolVersion: number; connect: (v: number, r: unknown) => Promise<unknown> } }).tonconnect;
    expect(tc).toMatchObject({ isWalletBrowser: true, protocolVersion: 2 });
    const p = tc.connect(2, REQUEST);
    expect(parseTcJsMessage(posted[0])).toEqual({ id: 1, method: 'connect', params: [2, REQUEST] });
    (win.__kalyxTcResolve as (id: number, v: unknown) => void)(1, { event: 'connect' });
    await expect(p).resolves.toEqual({ event: 'connect' });
  });
});

describe('Pont JS : connexion, reprise, transaction, déconnexion', () => {
  it('connect : la demande s’affiche, puis la page reçoit ton_addr + ton_proof', async () => {
    await useTonConnect.getState().jsCall('app.ston.fi', { id: 1, method: 'connect', params: [2, REQUEST] });
    expect(useTonConnect.getState().queue[0]).toMatchObject({ kind: 'connect', domain: 'app.ston.fi', js: { host: 'app.ston.fi', callId: 1 } });
    await useTonConnect.getState().approveConnect({ pin: '000000' } as never);
    const ev = answer(1);
    expect(ev.event).toBe('connect');
    const addr = ev.payload.items.find((i: { name: string }) => i.name === 'ton_addr');
    expect(addr).toMatchObject({ address: art.v5r1.raw, publicKey: art.publicKey });
    const proof = ev.payload.items.find((i: { name: string }) => i.name === 'ton_proof').proof;
    const digest = tonProofDigest(tonProofMessage(art.v5r1.raw, 'app.ston.fi', proof.timestamp, 'nonce-js'));
    expect(ed25519.verify(base64.decode(proof.signature), digest, hex.decode(art.publicKey))).toBe(true);
    // Rien ne part sur un pont HTTP.
    expect(sent).toHaveLength(0);
  });

  it('restoreConnection : la page retrouve sa connexion sans rien redemander', async () => {
    await useTonConnect.getState().jsCall('app.ston.fi', { id: 2, method: 'restoreConnection', params: [] });
    const ev = answer(2);
    expect(ev.event).toBe('connect');
    expect(ev.payload.items).toEqual([expect.objectContaining({ name: 'ton_addr', address: art.v5r1.raw })]);
    expect(useTonConnect.getState().queue).toHaveLength(0);
    // Un autre site, lui, n'est pas connecté.
    await useTonConnect.getState().jsCall('dedust.io', { id: 3, method: 'restoreConnection', params: [] });
    expect(answer(3).event).toBe('connect_error');
  });

  it('send(sendTransaction) : mise en file, signée, BOC rendu à la page', async () => {
    const msg = { method: 'sendTransaction', id: '5', params: [JSON.stringify({ valid_until: Math.floor(Date.now() / 1000) + 300, messages: [{ address: KEYS.keys[4].v4r2.eq, amount: '10000000' }] })] };
    await useTonConnect.getState().jsCall('app.ston.fi', { id: 4, method: 'send', params: [msg] });
    expect(useTonConnect.getState().queue[0]).toMatchObject({ kind: 'tx', requestId: '5', jsCallId: 4 });
    await new Promise((r) => setTimeout(r, 20));
    await useTonConnect.getState().approveTx({ pin: '000000' } as never);
    expect(answer(4)).toEqual({ result: broadcasts[broadcasts.length - 1], id: '5' });
  });

  it('une page qui n’est PAS le site du manifeste est refusée (pas de preuve au nom d’un autre)', async () => {
    const before = useTonConnect.getState().queue.length;
    await useTonConnect.getState().jsCall('ston-fi.evil.io', { id: 6, method: 'connect', params: [2, REQUEST] });
    expect(answer(6)).toMatchObject({ event: 'connect_error', payload: { code: 1 } });
    expect(useTonConnect.getState().queue.length).toBe(before);
  });

  it('send(disconnect) retire la session ; une transaction ensuite est refusée', async () => {
    await useTonConnect.getState().jsCall('app.ston.fi', { id: 7, method: 'send', params: [{ method: 'disconnect', id: '8', params: [] }] });
    expect(answer(7)).toEqual({ result: {}, id: '8' });
    expect(useTonConnect.getState().sessions.find((s) => s.clientId === 'js:app.ston.fi')).toBeUndefined();
    await useTonConnect.getState().jsCall('app.ston.fi', { id: 9, method: 'send', params: [{ method: 'sendTransaction', id: '10', params: ['{}'] }] });
    expect(answer(9)).toMatchObject({ error: { code: 100 }, id: '10' });
  });
});
