/**
 * TON Connect côté wallet : sessions, demandes en attente, réponses.
 *
 * Le protocole est dans `src/domain/tonconnect` (chiffrement, liens, preuve,
 * requêtes — chacun vérifié contre la référence) ; ici, l'état de l'app :
 *  - une SESSION par dApp connectée : clé x25519 à nous, identifiant client de
 *    la dApp, pont, manifeste, portefeuille et adresse TON utilisés. Gardée
 *    dans le stockage chiffré (`kv` = Keychain / Keystore) ;
 *  - une file de DEMANDES en attente (connexion, transaction), montrées une à
 *    une par `ui/TonConnectHost` ; rien n'est signé sans le code de
 *    l'utilisateur ;
 *  - un auditeur de pont par pont, pour toutes ses sessions à la fois.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { create } from 'zustand';
import { base64, hex } from '@scure/base';
import { ed25519 } from '@noble/curves/ed25519';
import { kvDel, kvGet, kvSet } from '../kv';
import { useWallet, type Unlock } from '../walletStore';
import { addressForChain } from '../accountAddress';
import { technicalLogger } from '../technicalLogger';
import { BridgeListener, bridgeSend, type BridgeMessage } from './bridge';
import {
  getAdapterV2,
  listChains,
  TonAdapterV2,
  withSigner,
  type ChainConfig,
  type Ed25519Signer,
} from '../../src';
import { decryptMessage, encryptMessage, newSessionKeyPair, type SessionKeyPair } from '../../src/domain/tonconnect/sessionCrypto';
import { manifestDomain, manifestOriginMatches, parseConnectLink, parseManifest, type DappManifest, type ParsedConnectLink } from '../../src/domain/tonconnect/connectLink';
import { blindSafe } from '../../src/domain/tonconnect/payload';
import { parseSignDataPayload, signDataDigest, tonNetworkId, type SignDataPayload } from '../../src/domain/tonconnect/signData';
import { Address } from '@ton/core';
import { buildTonProof, tonAddrReply } from '../../src/domain/tonconnect/tonProof';
import { parseSendTransaction, TC_ERROR, TC_MAX_MESSAGES, type DappTransaction } from '../../src/domain/tonconnect/requests';
import { tonWalletStateInitBoc } from '../../src/domain/chains/ton/tonTransfer';
import type { DappDraft } from '../../src/domain/chains/v2/TonAdapterV2';
import { pageMatchesManifest, tcEmitJs, tcResolveJs, validConnectRequest, type TcJsCall } from '../../src/domain/tonconnect/jsBridge';

export interface TcSession {
  /** Identifiant client de la dApp (sa clé publique x25519). */
  clientId: string;
  bridge: string;
  keyPair: SessionKeyPair;
  manifest: DappManifest;
  walletId: string;
  /** Adresse TON conviviale partagée avec la dApp. */
  address: string;
  chainId: string;
  connectedAt: number;
  lastEventId?: string;
}

export type TcPending =
  | {
      kind: 'connect';
      link: ParsedConnectLink;
      manifest: DappManifest;
      domain: string;
      proofPayload?: string;
      /** Demande venue du NAVIGATEUR intégré (pont JS) : page et appel à résoudre. */
      js?: { host: string; callId: number };
    }
  | { kind: 'tx'; session: TcSession; requestId: string; tx: DappTransaction; draft: DappDraft | null; error?: string; jsCallId?: number }
  /** Signature de DONNÉES (texte, octets, cellule), pas d'une transaction. */
  | { kind: 'signData'; session: TcSession; requestId: string; payload: SignDataPayload; jsCallId?: number };

/**
 * Sortie vers la page du navigateur intégré (pont JS). Branchée par l'écran du
 * navigateur : il n'exécute le JS que si la page ouverte est toujours `host`.
 */
export const tcJsHost: { deliver: ((host: string, js: string) => void) | null } = { deliver: null };
const JS_BRIDGE = 'js';
const jsClientId = (host: string) => `js:${host.toLowerCase()}`;

interface TcState {
  sessions: TcSession[];
  queue: TcPending[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  /** Lien ou QR scanné. Rend un message d'erreur lisible, ou null si la demande est affichée. */
  openLink: (text: string) => Promise<string | null>;
  approveConnect: (unlock: Unlock) => Promise<void>;
  rejectConnect: () => Promise<void>;
  approveTx: (unlock: Unlock) => Promise<string>;
  rejectTx: () => Promise<void>;
  approveSignData: (unlock: Unlock) => Promise<void>;
  rejectSignData: () => Promise<void>;
  disconnect: (clientId: string) => Promise<void>;
  /** Appel du pont JS d'une page du navigateur intégré. */
  jsCall: (host: string, call: TcJsCall) => Promise<void>;
}

const INDEX_KEY = 'tc.sessions';
const EVENT_ID_KEY = 'tc.eventId';
const sessionKey = (clientId: string) => `tc.s.${clientId}`;

/** Réseau TON du portefeuille : le réseau de test si c'est le réseau actif. */
function tonChain(): ChainConfig {
  const active = useWallet.getState().activeChain;
  const ton = listChains({ includeTestnets: true }).filter((c) => c.family === 'ton');
  return ton.find((c) => c.id === active) ?? ton.find((c) => !c.testnet)!;
}

export function tcDeviceInfo() {
  return device();
}

function device() {
  return {
    platform: Platform.OS === 'ios' ? 'iphone' : 'android',
    appName: 'kalyx',
    appVersion: Constants.expoConfig?.version ?? '0.1.0',
    maxProtocolVersion: 2,
    // La forme ancienne (« SendTransaction ») reste exigée par les vieux SDK.
    features: ['SendTransaction', { name: 'SendTransaction', maxMessages: TC_MAX_MESSAGES }, { name: 'SignData', types: ['text', 'binary', 'cell'] }],
  };
}

let eventCounter = 0;
async function nextEventId(): Promise<number> {
  if (eventCounter === 0) eventCounter = Number((await kvGet(EVENT_ID_KEY).catch(() => null)) ?? '0') || 0;
  eventCounter += 1;
  void kvSet(EVENT_ID_KEY, String(eventCounter)).catch(() => {});
  return eventCounter;
}

/** Chiffre et envoie un message à la dApp d'une session (ou d'une connexion en cours). */
async function sendTo(bridge: string, keyPair: SessionKeyPair, dappClientId: string, payload: unknown, topic?: string): Promise<void> {
  const blob = encryptMessage(JSON.stringify(payload), dappClientId, keyPair.secretKey);
  await bridgeSend(bridge, keyPair.publicKey, dappClientId, base64.encode(blob), topic);
}

async function persist(sessions: TcSession[]): Promise<void> {
  await kvSet(INDEX_KEY, JSON.stringify(sessions.map((s) => s.clientId)));
  await Promise.all(sessions.map((s) => kvSet(sessionKey(s.clientId), JSON.stringify(s))));
}

const listeners = new Map<string, BridgeListener>();

async function fetchManifest(url: string): Promise<DappManifest | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    return res.ok ? parseManifest(await res.json()) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const useTonConnect = create<TcState>((set, get) => {
  /** Une connexion par pont, pour toutes ses sessions. */
  const relisten = () => {
    for (const l of listeners.values()) l.stop();
    listeners.clear();
    const byBridge = new Map<string, TcSession[]>();
    // Les sessions du navigateur intégré n'ont pas de pont HTTP à écouter.
    for (const s of get().sessions.filter((x) => x.bridge !== JS_BRIDGE)) byBridge.set(s.bridge, [...(byBridge.get(s.bridge) ?? []), s]);
    for (const [bridge, list] of byBridge) {
      const last = list.map((s) => s.lastEventId).filter(Boolean).sort().pop();
      const l = new BridgeListener(bridge, list.map((s) => s.keyPair.publicKey), last, (m) => void onMessage(m));
      listeners.set(bridge, l);
      l.start();
    }
  };

  const respond = (session: TcSession, payload: unknown) => sendTo(session.bridge, session.keyPair, session.clientId, payload);
  /** Réponse à un appel de page (pont JS). */
  const jsResolve = (host: string, callId: number, payload: unknown) => tcJsHost.deliver?.(host, tcResolveJs(callId, payload));
  const hostOfSession = (s: TcSession) => s.clientId.slice(3);

  /** Réponse `ton_addr` seule, pour une page qui retrouve sa connexion. */
  const addrItem = (session: TcSession) => {
    const w = useWallet.getState();
    /*
     * Le compte de la SESSION, pas le premier compte TON venu : après un
     * changement de portefeuille, la clé publique rendue ne correspondait plus
     * à l'adresse de la session. Portefeuille ou adresse différents : pas de
     * connexion à retrouver, la page redemandera.
     */
    if (w.activeWalletId !== session.walletId) return null;
    const stored = w.accounts.find((a) => !!a.tonPublicKey);
    const chain = listChains({ includeTestnets: true }).find((c) => c.id === session.chainId);
    if (!stored?.tonPublicKey || !chain || addressForChain(stored, chain) !== session.address) return null;
    const pub = hex.decode(stored.tonPublicKey);
    return tonAddrReply({ address: session.address, testnet: !!chain.testnet, publicKeyHex: stored.tonPublicKey.toLowerCase(), stateInitBoc: tonWalletStateInitBoc(pub, stored.tonVersion ?? 'v5r1', !!chain.testnet) });
  };

  /** Transaction demandée par une dApp (pont HTTP ou JS) : mise en file, puis émulée. */
  const enqueueTx = (session: TcSession, id: string, raw: unknown, reply: (payload: unknown) => void, jsCallId?: number) => {
    const parsed = parseSendTransaction(raw, { address: session.address, testnet: session.chainId !== 'ton', nowSeconds: Math.floor(Date.now() / 1000) });
    if (!parsed.ok) {
      reply({ error: { code: parsed.code, message: parsed.message }, id });
      return;
    }
    const pending: TcPending = { kind: 'tx', session, requestId: id, tx: parsed.tx, draft: null, ...(jsCallId !== undefined ? { jsCallId } : {}) };
    set({ queue: [...get().queue, pending] });
    // L'émulation arrive après : l'écran s'ouvre tout de suite, le bilan se complète.
    const adapter = getAdapterV2(session.chainId);
    if (adapter instanceof TonAdapterV2) {
      adapter
        .prepareDappTransfer(session.address, parsed.tx)
        .then((draft) => set({ queue: get().queue.map((p) => (p === pending ? { ...pending, draft } : p)) }))
        .catch((e) => set({ queue: get().queue.map((p) => (p === pending ? { ...pending, error: e instanceof Error ? e.message : String(e) } : p)) }));
    }
  };

  /** Demande de signature de données (pont HTTP ou JS) : lue, puis mise en file. */
  const enqueueSignData = (session: TcSession, id: string, raw: unknown, reply: (payload: unknown) => void, jsCallId?: number) => {
    const payload = parseSignDataPayload(raw);
    console.log('[KALYX-TC] signData:reçu', { type: payload?.type ?? 'invalide', network: payload?.network ?? null });
    if (!payload) {
      reply({ error: { code: TC_ERROR.BAD_REQUEST, message: 'Bad signData request' }, id });
      return;
    }
    set({ queue: [...get().queue, { kind: 'signData', session, requestId: id, payload, ...(jsCallId !== undefined ? { jsCallId } : {}) }] });
  };

  /** Répond à la dApp d'une demande de transaction, par son transport. */
  const replyTx = (p: Extract<TcPending, { kind: 'tx' | 'signData' }>, payload: unknown) =>
    p.session.bridge === JS_BRIDGE ? Promise.resolve(p.jsCallId !== undefined && jsResolve(hostOfSession(p.session), p.jsCallId, payload)) : respond(p.session, payload);

  const remove = async (clientId: string) => {
    const sessions = get().sessions.filter((s) => s.clientId !== clientId);
    set({ sessions, queue: get().queue.filter((p) => p.kind === 'connect' || p.session.clientId !== clientId) });
    await kvDel(sessionKey(clientId)).catch(() => {});
    await persist(sessions).catch(() => {});
    relisten();
  };

  const onMessage = async (m: BridgeMessage) => {
    const session = get().sessions.find((s) => s.clientId === m.from);
    if (!session) return;
    if (m.eventId) {
      session.lastEventId = m.eventId;
      void kvSet(sessionKey(session.clientId), JSON.stringify(session)).catch(() => {});
    }
    let req: { method?: string; params?: unknown[]; id?: string | number };
    try {
      req = JSON.parse(decryptMessage(base64.decode(m.message), session.clientId, session.keyPair.secretKey));
    } catch {
      technicalLogger.logDapp('tonconnect: message indéchiffrable ignoré', session.manifest.url);
      return;
    }
    const id = String(req.id ?? '');
    if (req.method === 'disconnect') {
      await respond(session, { result: {}, id }).catch(() => {});
      await remove(session.clientId);
      return;
    }
    if (req.method === 'signData') {
      enqueueSignData(session, id, req.params?.[0], (payload) => void respond(session, payload).catch(() => {}));
      return;
    }
    if (req.method !== 'sendTransaction') {
      await respond(session, { error: { code: TC_ERROR.METHOD_NOT_SUPPORTED, message: 'Method not supported' }, id }).catch(() => {});
      return;
    }
    enqueueTx(session, id, req.params?.[0], (payload) => void respond(session, payload).catch(() => {}));
  };

  /** Signataire TON du portefeuille ACTIF, pour UNE opération ; effacé ensuite. */
  const withTonSigner = async <T>(chainId: string, unlock: Unlock, fn: (signer: Ed25519Signer, adapter: TonAdapterV2) => Promise<T>) => {
    const adapter = getAdapterV2(chainId);
    if (!(adapter instanceof TonAdapterV2)) throw new Error('TON indisponible');
    const signer = await useWallet.getState().deriveSigner(adapter, unlock);
    return withSigner(signer, (s) => {
      if (s.curve !== 'ed25519') throw new Error('Signataire ed25519 attendu');
      return fn(s, adapter);
    });
  };

  return {
    sessions: [],
    queue: [],
    hydrated: false,

    hydrate: async () => {
      if (get().hydrated) return;
      try {
        const ids = JSON.parse((await kvGet(INDEX_KEY)) ?? '[]') as string[];
        const sessions = (await Promise.all(ids.map((id) => kvGet(sessionKey(id)).catch(() => null))))
          .filter((x): x is string => !!x)
          .map((x) => JSON.parse(x) as TcSession);
        set({ sessions, hydrated: true });
      } catch {
        set({ hydrated: true });
      }
      relisten();
    },

    openLink: async (text) => {
      const link = parseConnectLink(text);
      console.log('[KALYX-TC] openLink', { parsed: !!link });
      if (!link) return 'tcInvalidLink';
      const manifest = await fetchManifest(link.request.manifestUrl);
      console.log('[KALYX-TC] manifest', { url: link.request.manifestUrl, ok: !!manifest });
      if (!manifest) return 'tcManifestError';
      if (!manifestOriginMatches(link.request.manifestUrl, manifest)) return 'tcManifestMismatch';
      const proof = link.request.items.find((i) => i.name === 'ton_proof') as { payload?: string } | undefined;
      set({ queue: [...get().queue, { kind: 'connect', link, manifest, domain: manifestDomain(manifest), proofPayload: proof?.payload }] });
      return null;
    },

    approveConnect: async (unlock) => {
      const p = get().queue[0];
      if (p?.kind !== 'connect') return;
      const w = useWallet.getState();
      const chain = tonChain();
      const stored = w.accounts[w.activeAccountIndex];
      const address = addressForChain(stored, chain);
      if (!address || !stored?.tonPublicKey) throw new Error('tcNoTonAccount');
      const keyPair = newSessionKeyPair();
      const items: unknown[] = [];
      await withTonSigner(chain.id, unlock, async (signer) => {
        const publicKey = signer.publicKey;
        const secret = signer.secretKey.subarray(0, 32);
        const pub = Buffer.from(publicKey).toString('hex');
        if (pub !== stored.tonPublicKey!.toLowerCase()) throw new Error('tcKeyMismatch');
        items.push(tonAddrReply({ address, testnet: !!chain.testnet, publicKeyHex: pub, stateInitBoc: tonWalletStateInitBoc(publicKey, stored.tonVersion ?? 'v5r1', !!chain.testnet) }));
        if (p.proofPayload !== undefined) {
          items.push(await buildTonProof({ address, domain: p.domain, payload: p.proofPayload, timestamp: Math.floor(Date.now() / 1000) }, (d) => ed25519.sign(d, secret)));
        }
      });
      const event = { event: 'connect', id: await nextEventId(), payload: { items, device: device() } };
      if (p.js) jsResolve(p.js.host, p.js.callId, event);
      else await sendTo(p.link.bridge, keyPair, p.link.clientId, event);
      const session: TcSession = {
        clientId: p.link.clientId,
        bridge: p.link.bridge,
        keyPair,
        manifest: p.manifest,
        walletId: w.activeWalletId,
        address,
        chainId: chain.id,
        connectedAt: Date.now(),
      };
      const sessions = [...get().sessions.filter((s) => s.clientId !== session.clientId), session];
      set({ sessions, queue: get().queue.slice(1) });
      await persist(sessions);
      relisten();
    },

    rejectConnect: async () => {
      const p = get().queue[0];
      if (p?.kind !== 'connect') return;
      set({ queue: get().queue.slice(1) });
      const event = { event: 'connect_error', id: await nextEventId(), payload: { code: TC_ERROR.USER_REJECTS, message: 'User declined the connection' } };
      if (p.js) {
        jsResolve(p.js.host, p.js.callId, event);
        return;
      }
      // Réponse d'une clé jetable : la dApp sait que l'utilisateur a refusé.
      await sendTo(p.link.bridge, newSessionKeyPair(), p.link.clientId, event).catch(() => {});
    },

    approveTx: async (unlock) => {
      const p = get().queue[0];
      console.log('[KALYX-TC] approveTx:start', { pending: p?.kind ?? null, emulation: p?.kind === 'tx' ? (p.draft?.emulation ? 'ok' : p.error ? `erreur: ${p.error}` : 'aucune') : null });
      if (p?.kind !== 'tx') throw new Error('tcNothingPending');
      await (await import('../whitelistStore')).assertDappAllowed(); // liste blanche en vigueur : pas de transaction de dApp
      const { session } = p;
      const w = useWallet.getState();
      if (w.activeWalletId !== session.walletId) throw new Error('tcWrongWallet');
      // Le compte ACTIF doit être celui dont l'adresse a été partagée (le principal, seul à avoir TON).
      const chain = listChains({ includeTestnets: true }).find((c) => c.id === session.chainId);
      if (!chain || addressForChain(w.accounts[w.activeAccountIndex], chain) !== session.address) throw new Error('tcWrongAccount');
      /*
       * Jamais à l'aveugle : sans émulation MONTRÉE, seuls les envois simples
       * de TON (ce que l'écran affiche en entier) sont signables. Un transfert
       * de jetons ou de NFT caché dans les données serait sinon invisible.
       */
      if (p.draft?.emulation?.failed) throw new Error('tcWillFail');
      if (!p.draft?.emulation && !blindSafe(p.tx.messages)) throw new Error('tcCannotVerify');
      const adapter = getAdapterV2(session.chainId);
      if (!(adapter instanceof TonAdapterV2)) throw new Error('TON indisponible');
      // État relu au moment de signer : le seqno a pu bouger depuis l'affichage.
      const draft = await adapter.prepareDappTransfer(session.address, p.tx);
      const signed = await withTonSigner(session.chainId, unlock, (signer) => adapter.signDappTransfer(draft, signer));
      await adapter.broadcastDapp(signed);
      set({ queue: get().queue.slice(1) });
      await replyTx(p, { result: signed.boc, id: p.requestId }).catch(() => {});
      return signed.txid;
    },

    rejectTx: async () => {
      const p = get().queue[0];
      if (p?.kind !== 'tx') return;
      set({ queue: get().queue.slice(1) });
      await replyTx(p, { error: { code: TC_ERROR.USER_REJECTS, message: 'User declined the transaction' }, id: p.requestId }).catch(() => {});
    },

    approveSignData: async (unlock) => {
      await (await import('../whitelistStore')).assertDappAllowed(); // liste blanche : aucune signature de dApp
      const p = get().queue[0];
      if (p?.kind !== 'signData') throw new Error('tcNothingPending');
      const { session, payload } = p;
      const w = useWallet.getState();
      if (w.activeWalletId !== session.walletId) throw new Error('tcWrongWallet');
      const chain = listChains({ includeTestnets: true }).find((c) => c.id === session.chainId);
      if (!chain || addressForChain(w.accounts[w.activeAccountIndex], chain) !== session.address) throw new Error('tcWrongAccount');
      /*
       * Règles de la spécification, appliquées AVANT la clé : un réseau
       * différent de celui du portefeuille, ou une adresse de signature
       * différente de celle connectée, et on ne signe pas.
       */
      if (payload.network !== undefined && payload.network !== tonNetworkId(!!chain.testnet)) throw new Error('tcSignDataWrongNetwork');
      const me = Address.parse(session.address);
      if (payload.from !== undefined) {
        let from: Address | null = null;
        try {
          from = Address.parse(payload.from);
        } catch {
          from = null;
        }
        if (!from || !from.equals(me)) throw new Error('tcSignDataWrongAccount');
      }
      const domain = manifestDomain(session.manifest);
      const timestamp = Math.floor(Date.now() / 1000);
      const digest = signDataDigest(payload, me, domain, timestamp);
      const signature = await withTonSigner(session.chainId, unlock, async (signer) => base64.encode(ed25519.sign(digest, signer.secretKey.subarray(0, 32))));
      set({ queue: get().queue.slice(1) });
      console.log('[KALYX-TC] signData:signé', { type: payload.type, domain });
      await replyTx(p, { result: { signature, address: me.toRawString(), timestamp, domain, payload }, id: p.requestId }).catch(() => {});
    },

    rejectSignData: async () => {
      const p = get().queue[0];
      if (p?.kind !== 'signData') return;
      set({ queue: get().queue.slice(1) });
      await replyTx(p, { error: { code: TC_ERROR.USER_REJECTS, message: 'User declined the request' }, id: p.requestId }).catch(() => {});
    },

    disconnect: async (clientId) => {
      const session = get().sessions.find((s) => s.clientId === clientId);
      const event = { event: 'disconnect', id: await nextEventId(), payload: {} };
      if (session?.bridge === JS_BRIDGE) tcJsHost.deliver?.(hostOfSession(session), tcEmitJs(event));
      else if (session) await respond(session, event).catch(() => {});
      await remove(clientId);
    },

    jsCall: async (host, call) => {
      const clientId = jsClientId(host);
      const session = get().sessions.find((s) => s.clientId === clientId);
      if (call.method === 'restoreConnection') {
        // La page retrouve sa connexion sans rien redemander — si elle en a une.
        const item = session ? addrItem(session) : null;
        jsResolve(host, call.id, item
          ? { event: 'connect', id: await nextEventId(), payload: { items: [item], device: device() } }
          : { event: 'connect_error', id: await nextEventId(), payload: { code: TC_ERROR.UNKNOWN, message: 'Not connected' } });
        return;
      }
      if (call.method === 'connect') {
        const request = validConnectRequest(call.params[1]);
        const fail = async (code: number, message: string) => jsResolve(host, call.id, { event: 'connect_error', id: await nextEventId(), payload: { code, message } });
        if (!request) return fail(TC_ERROR.BAD_REQUEST, 'Bad connect request');
        const manifest = await fetchManifest(request.manifestUrl);
        if (!manifest || !manifestOriginMatches(request.manifestUrl, manifest)) return fail(TC_ERROR.BAD_REQUEST, 'Manifest unavailable or mismatched');
        if (!pageMatchesManifest(host, manifest)) {
          technicalLogger.logDapp(`tonconnect js: page ${host} ≠ manifeste ${manifest.url}`);
          return fail(TC_ERROR.BAD_REQUEST, 'Manifest does not belong to this page');
        }
        const proof = request.items.find((i) => i.name === 'ton_proof') as { payload?: string } | undefined;
        const link: ParsedConnectLink = { clientId, request, bridge: JS_BRIDGE };
        set({ queue: [...get().queue, { kind: 'connect', link, manifest, domain: manifestDomain(manifest), proofPayload: proof?.payload, js: { host, callId: call.id } }] });
        return;
      }
      // send : { method, params, id }
      const msg = call.params[0] as { method?: string; params?: unknown[]; id?: string | number } | undefined;
      const id = String(msg?.id ?? '');
      const reply = (payload: unknown) => jsResolve(host, call.id, payload);
      if (!session) return reply({ error: { code: TC_ERROR.UNKNOWN_APP, message: 'Not connected' }, id });
      if (msg?.method === 'disconnect') {
        reply({ result: {}, id });
        await remove(clientId);
        return;
      }
      if (msg?.method === 'signData') return enqueueSignData(session, id, msg.params?.[0], reply, call.id);
      if (msg?.method !== 'sendTransaction') return reply({ error: { code: TC_ERROR.METHOD_NOT_SUPPORTED, message: 'Method not supported' }, id });
      enqueueTx(session, id, msg.params?.[0], reply, call.id);
    },
  };
});
