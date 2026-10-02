import { base58, base64, hex } from '@scure/base';
import { isDecoySession } from './sessionMode';
import { solanaTxDecode } from '../src/domain/wc/solanaTx';
import { signMessageParam } from './dappProvider';
import { utf8ToBytes } from '@noble/hashes/utils';
/**
 * WalletConnect (Reown) — Kalyx est le WALLET auquel les dApps se connectent.
 * Flux : coller une URI wc: → proposition de session → approbation (compte actif
 * exposé) → requêtes (sign / tx) confirmées avec PIN.
 *
 * IMPORTANT : le SDK (+ async-storage natif) est chargé en IMPORT DYNAMIQUE dans
 * init(), pas au démarrage. Ainsi, tant que le dev build n'a pas été rebuild avec
 * les modules natifs, l'app ne crashe pas — WalletConnect reste simplement inactif.
 * La signature est déléguée au walletStore (la clé reste isolée).
 */
import { Platform, AppState, Linking } from 'react-native';
import { create } from 'zustand';
import { technicalLogger } from './technicalLogger';
import { useSettings } from './settingsStore';
import { fill, translate, type Key } from './i18n';
import { useWallet, type Unlock } from './walletStore';
import { notify } from './notifications';
import { listChains, getAdapter, getAdapterV2, withSigner, assertCurve, WcConnectError, isValidEvmAddress, shortAddress, WalletError, type RawTxRequest } from '../src';
import { handleSmartError } from './errorHandler';
import { submitSolanaSigned } from './solanaSubmit';
import type { IWeb3Wallet } from '@walletconnect/web3wallet';

// Libellé lisible d'une méthode WalletConnect (pour la notification de signature).


import { VersionedTransaction } from '@solana/web3.js';
import { Transaction as BtcTransaction } from '@scure/btc-signer';
function extractSolanaSignature(tx: string, address: string): string {
  try {
    const decoded = solanaTxDecode(tx);
    if (!decoded) return tx;
    const vtx = VersionedTransaction.deserialize(decoded.bytes);
    const idx = vtx.message.staticAccountKeys.findIndex(k => k.toBase58() === address);
    if (idx >= 0 && vtx.signatures[idx]) {
      return base58.encode(vtx.signatures[idx]);
    }
    return base58.encode(vtx.signatures[0]);
  } catch {
    return tx;
  }
}

/** Spec WalletConnect Solana : `transaction` (signée, sérialisée) est renvoyée en BASE64. */
function ensureBase64(tx: string): string {
  // Encodage reconnu par la LECTURE de la transaction, pas deviné d'après les caractères.
  const decoded = solanaTxDecode(tx);
  if (!decoded) return tx;
  return decoded.encoding === 'base64' ? tx : base64.encode(decoded.bytes);
}

/** Méthodes qui exigent une décision de l'utilisateur ; tout le reste est répondu automatiquement. */
const SIGNING_METHODS = new Set([
  'personal_sign', 'eth_sign', 'eth_signTypedData', 'eth_signTypedData_v3', 'eth_signTypedData_v4', 'eth_sendTransaction', 'eth_signTransaction',
  'solana_signTransaction', 'solana_signAllTransactions', 'solana_signMessage', 'solana_signAndSendTransaction',
  'bitcoin_signMessage', 'signMessage', 'bitcoin_signPsbt', 'signPsbt', 'bitcoin_sendTransaction', 'sendTransfer', 'bitcoin_sendTransfer',
  'bitcoin_getAccounts', 'getAccountAddresses', 'bitcoin_getAccountAddresses', 'getAccounts',
]);

/** Libellé (clé de traduction) d'une demande, pour la notification. */
const METHOD_LABELS: Record<string, Key> = {
  eth_sendTransaction: 'wcReqTx',
  personal_sign: 'wcReqMessage',
  eth_sign: 'wcReqMessage',
  eth_signTypedData: 'wcReqTyped',
  eth_signTypedData_v4: 'wcReqTyped',
  solana_signTransaction: 'wcReqSolTx',
  solana_signAllTransactions: 'wcReqSolTx',
  solana_signMessage: 'wcReqMessage',
  bitcoin_sendTransfer: 'wcReqBtcTx',
  bitcoin_sendTransaction: 'wcReqBtcTx',
  bitcoin_signPsbt: 'wcReqBtcTx',
  bitcoin_signMessage: 'wcReqMessage',
};

/** Texte de notification dans la langue de l'utilisateur (lue à l'envoi ; c'était du français pour tous). */
const tr = (key: Key, vars: Record<string, string> = {}) => fill(translate(useSettings.getState().language, key), vars);

/** Notifie une demande entrante (proposition/requête) quand l'app n'est PAS au
 *  premier plan — appuyer sur la notification rouvre Kalyx, où la fenêtre de
 *  signature (WalletConnectHost) s'affiche déjà pour toute demande en attente. */
function notifyIncoming(title: string, body: string) {
  if (AppState.currentState === 'active') return; // au 1er plan : la modale suffit
  void notify(title, body);
}

const PROJECT_ID = process.env.EXPO_PUBLIC_WALLETCONNECT_ID || '';

/**
 * DÉCONNEXION QUI ABOUTIT TOUJOURS DE NOTRE CÔTÉ.
 *
 * `disconnectSession` passe par le relais : session déjà expirée là-bas, réseau
 * coupé, et il levait — la session restait enregistrée, la liste ne bougeait
 * pas, « Déconnecter » semblait ne rien faire. On prévient la dApp si on peut
 * (8 s au plus), puis on SUPPRIME la session et son appairage localement quoi
 * qu'il arrive.
 */
async function forceDisconnect(w: IWeb3Wallet | null, topic: string): Promise<void> {
  if (!w) return;
  const reason = sdkUtils?.getSdkError('USER_DISCONNECTED') ?? { code: 6000, message: 'User disconnected' };
  const pairingTopic: string | undefined = (w.getActiveSessions()?.[topic] as any)?.pairingTopic;
  try {
    await Promise.race([
      w.disconnectSession({ topic, reason: reason as never }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
    ]);
    console.log('[KALYX-WC] disconnect:ok', { topic: topic.slice(0, 8) });
  } catch (e) {
    console.warn('[KALYX-WC] disconnect:relay-failed, suppression locale', { topic: topic.slice(0, 8), error: e instanceof Error ? e.message : String(e) });
    try {
      await (w as any).engine?.signClient?.session?.delete?.(topic, reason);
    } catch {
      /* déjà absente */
    }
  }
  if (pairingTopic) {
    try {
      await (w as any).core?.pairing?.disconnect?.({ topic: pairingTopic });
    } catch {
      /* appairage déjà fermé */
    }
  }
}

// Utilitaires SDK chargés à l'init (import dynamique).
/* eslint-disable @typescript-eslint/no-explicit-any */
let sdkUtils: { buildApprovedNamespaces: (a: any) => any; getSdkError: (k: any) => any } | null = null;

// Filtre (une seule fois) les logs WC internes bénins : nettoyage de
// propositions/sessions expirées par le heartbeat (aucune action utilisateur
// requise), et expiration d'URI de pairing (déjà remontée proprement à l'UI
// via un Alert dans l'écran WalletConnect). Ces messages sont émis en
// console.error par le SDK (pino) et déclencheraient sinon l'overlay rouge RN.
// Idempotent : init() peut être relancé après un échec.
const BENIGN_WC_LOGS = [
  'Record was recently deleted',
  'No matching key',
  'pair() URI has expired',
  'Expired. pair()',
  // Rescan d'un QR déjà appairé : WC réutilise l'appairage, aucune action requise.
  'Pairing already exists',
  // Appairage expiré (QR périmé) : déjà remonté à l'UI, le heartbeat nettoie.
  'Expired. pairing topic',
  // Messages relais chiffrés avec une clé d'une session déjà supprimée côté pair
  // (déconnexion / reconnexion) : impossibles à déchiffrer, sans conséquence.
  'Failed to decode message from topic',
  'is not identifiable as a JSON-RPC request or a response',
  'Decoded payload on topic',
];
let consoleFiltered = false;
function silenceBenignWcLogs() {
  if (consoleFiltered) return;
  consoleFiltered = true;
  const isBenign = (args: unknown[]) => {
    let joined = '';
    for (const a of args) {
      try {
        joined += typeof a === 'string' ? a : JSON.stringify(a);
      } catch {
        joined += String(a);
      }
      joined += ' ';
    }
    return BENIGN_WC_LOGS.some((p) => joined.includes(p));
  };
  for (const level of ['warn', 'error'] as const) {
    const fn = console[level];
    if (typeof fn !== 'function') continue;
    const orig = fn.bind(console);
    console[level] = (...args: unknown[]) => (isBenign(args) ? undefined : orig(...args));
  }
}

interface EvmChain {
  caip: string;
  kalyxId: string;
  evmChainId: number;
}
/** Message d'erreur lisible, quelle que soit la forme de l'erreur (Error, { message }, objet, chaîne). */
function errorText(e: unknown): string {
  if (e instanceof Error) return typeof e.message === 'string' ? e.message : errorText(e.message);
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object') {
    const m = (e as { message?: unknown; reason?: unknown; error?: unknown }).message ?? (e as { reason?: unknown }).reason ?? (e as { error?: unknown }).error;
    if (m !== undefined && m !== e) return errorText(m);
    try { return JSON.stringify(e); } catch { return String(e); }
  }
  return String(e);
}

/** Après une réponse, rend la main à la dApp mobile qui a déclaré un lien de retour (recommandation WalletConnect). */
function returnToDapp(wallet: IWeb3Wallet, topic: string): void {
  try {
    const r = wallet.getActiveSessions()?.[topic]?.peer?.metadata?.redirect as { native?: string; universal?: string } | undefined;
    const url = r?.native || r?.universal;
    if (url) Linking.openURL(url).catch(() => {});
  } catch {
    /* pas de lien de retour : l'utilisateur revient lui-même */
  }
}

/**
 * Rouvre la connexion au relais si elle est tombée.
 *
 * « FAILED TO PUBLISH PAYLOAD … tag:1110 ». Le tag 1110 est `wc_sessionEvent` :
 * l'événement « réseau changé » envoyé aux dApps. Chaque échec arrivait 60 s
 * pile après un changement de réseau — le délai de publication : le message
 * attendait un relais dont la connexion était morte (app passée en arrière-plan,
 * réseau mobile qui change), jamais rétablie. On la rétablit avant d'envoyer,
 * et au retour au premier plan.
 */
async function ensureRelay(wallet: IWeb3Wallet): Promise<void> {
  const relayer = (wallet as any)?.core?.relayer as { connected?: boolean; transportOpen?: () => Promise<void>; restartTransport?: () => Promise<void> } | undefined;
  if (!relayer || relayer.connected !== false) return;
  try {
    await relayer.transportOpen?.();
  } catch {
    await relayer.restartTransport?.().catch(() => {});
  }
}

let chainBroadcastTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Prévient les sessions EVM que le réseau actif a changé dans l'app.
 *
 * REGROUPÉ : plusieurs changements rapprochés (swap, navigateur, sélecteur)
 * n'envoient que le DERNIER réseau, une fois le relais joignable. Les sessions
 * expirées sont ignorées — publier vers elles ne peut qu'échouer.
 */
function broadcastChainChanged(wallet: IWeb3Wallet, kalyxId: string): void {
  if (chainBroadcastTimer) clearTimeout(chainBroadcastTimer);
  chainBroadcastTimer = setTimeout(() => {
    chainBroadcastTimer = null;
    const chain = evmChains().find((c) => c.kalyxId === kalyxId);
    if (!chain) return;
    const sessions = Object.values(wallet.getActiveSessions?.() ?? {}) as any[];
    const now = Math.floor(Date.now() / 1000);
    const targets = sessions.filter((s) => (s?.namespaces?.eip155?.chains ?? []).includes(chain.caip) && !(typeof s?.expiry === 'number' && s.expiry <= now));
    if (!targets.length) return;
    void ensureRelay(wallet).then(() => {
      for (const s of targets) {
        wallet.emitSessionEvent({ topic: s.topic, event: { name: 'chainChanged', data: chain.evmChainId }, chainId: chain.caip }).catch((e: unknown) => {
          technicalLogger.logSys('WalletConnect chainChanged non publié', { error: e instanceof Error ? e.message.slice(0, 120) : String(e) });
        });
      }
    });
  }, 800);
}

function evmChains(): EvmChain[] {
  return listChains()
    .filter((c) => c.family === 'evm' && c.evmChainId)
    .map((c) => ({ caip: `eip155:${c.evmChainId}`, kalyxId: c.id, evmChainId: c.evmChainId! }));
}

// CAIP-2 des réseaux non-EVM (WalletConnect). Solana mainnet + Bitcoin mainnet.
export const SOLANA_CAIP = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
export const BTC_CAIP = 'bip122:000000000019d6689c085ae165831e93';


export interface WcSession {
  topic: string;
  name: string;
  url: string;
  icon?: string;
}

interface WcState {
  configured: boolean;
  ready: boolean;
  wallet: IWeb3Wallet | null;
  sessions: WcSession[];
  proposal: any | null;
  requestQueue: any[];
  request: any | null;

  init: () => Promise<void>;
  pair: (uri: string) => Promise<void>;
  /** Autorisations accordées au site : `tx` (proposer des transactions),
   *  `sign` (demander des signatures de message). La lecture (adresses/soldes)
   *  est inhérente à la connexion. Par défaut : tout autorisé. */
  /**
   * `accountIndex` : indice de DÉRIVATION HD du compte à partager. Absent = le
   * compte actif. La dApp ne voyait jusqu'ici que ce dernier, sans qu'on puisse
   * en choisir un autre — alors qu'une session WalletConnect se noue avec UN
   * compte et ne peut plus changer ensuite.
   */
  approveProposal: (unlock: Unlock, perms?: { tx: boolean; sign: boolean }, accountIndex?: number) => Promise<void>;
  rejectProposal: () => Promise<void>;
  /** `overrideData` : calldata de remplacement (ex. approve réduit au montant exact). */
  approveRequest: (unlock: Unlock, overrideData?: string) => Promise<void>;
  rejectRequest: () => Promise<void>;
  disconnect: (topic: string) => Promise<void>;
  /** Coupe TOUTES les sessions actives (ex. au verrouillage de Kalyx). */
  disconnectAll: () => Promise<void>;
  /** Coupe les sessions qui utilisent l'une de ces adresses (portefeuille supprimé). */
  disconnectAddresses: (addresses: string[]) => Promise<void>;
  refresh: () => void;
}

let _wcInitializing = false;

/**
 * Compte actif — par indice de DÉRIVATION HD, jamais par position de tableau.
 *
 * `activeAccountIndex` est l'indice HD (0, 1, 2…), et le reste du code le
 * résout ainsi (cf. `toAccount` dans lib/walletStore). Ce fichier faisait
 * `accounts[activeAccountIndex]`, ce qui n'est équivalent que si aucun compte
 * n'a jamais été supprimé ni réordonné. Sinon la dApp recevait l'adresse d'un
 * compte DIFFÉRENT de celui qui signe — et la vérification échouait côté dApp,
 * sans que rien ne le signale de ce côté-ci.
 */
function activeAccount() {
  const s = useWallet.getState();
  return s.accounts.find((a) => a.index === s.activeAccountIndex) ?? s.accounts[0];
}

export const useWalletConnect = create<WcState>((set, get) => ({
  configured: PROJECT_ID.length > 0,
  ready: false,
  wallet: null,
  sessions: [],
  proposal: null,
  requestQueue: [],
  request: null,

  init: async () => {
    console.log('[KALYX-WC] init', { projectId: PROJECT_ID ? 'présent' : 'ABSENT', ready: !!get().wallet, initializing: _wcInitializing });
    if (!PROJECT_ID || get().wallet || _wcInitializing) return;
    _wcInitializing = true;
    try {
      silenceBenignWcLogs();
    // Chargement dynamique : n'exécute le code natif qu'ici.
    // Le polyfill react-native-compat est RN-only : sur web, le navigateur fournit
    // déjà crypto/WebSocket, et l'importer casserait l'init WalletConnect.
    if (Platform.OS !== 'web') await import('@walletconnect/react-native-compat');
    const [{ Core }, { Web3Wallet }, utils] = await Promise.all([
      import('@walletconnect/core'),
      import('@walletconnect/web3wallet'),
      import('@walletconnect/utils'),
    ]);
    sdkUtils = { buildApprovedNamespaces: utils.buildApprovedNamespaces, getSdkError: utils.getSdkError };

    const core = new Core({ projectId: PROJECT_ID });
    const w = (await Web3Wallet.init({
      // Deux versions de @walletconnect/types coexistent dans node_modules
      // (core vs web3wallet) : structurellement identiques, cast nécessaire.
      core: core as any,
      // Web3Wallet est l'adaptateur wallet officiel au-dessus de SignClient :
      // il conserve le transport/session du protocole sans exposer de clé.
      metadata: {
        name: 'Kalyx Wallet',
        description: 'Non-custodial multi-chain wallet — Bitcoin, Ethereum, Solana',
        url: 'https://kalyxwallet.com',
        icons: ['https://kalyxwallet.com/icon.png'],
        redirect: { native: 'kalyx://', universal: 'https://kalyxwallet.com/wc' },
      },
    })) as IWeb3Wallet;

    w.on('session_proposal', (proposal: any) => {
      set({ proposal });
      const name = proposal?.params?.proposer?.metadata?.name;
      notifyIncoming(tr('notifWcConnectTitle'), name ? tr('notifWcConnectBody', { name }) : tr('notifWcConnectBodyUnknown'));
    });
    w.on('session_request', async (request: any) => {
      // Session leurre : les vraies dApps ne reçoivent rien d'elle (refus silencieux, rien en file).
      if (isDecoySession()) {
        try {
          await w.respondSessionRequest({ topic: request?.topic, response: { id: request?.id, jsonrpc: '2.0', error: { code: 4001, message: 'User rejected' } } });
        } catch {
          /* rien */
        }
        return;
      }
      console.log('\n[WC-IN] === SESSION_REQUEST RECEIVED ===');
      console.log('[WC-IN] ID:', request?.id);
      console.log('[WC-IN] Topic:', request?.topic);
      console.log('[WC-IN] Method:', request?.params?.request?.method);
      console.log('[WC-IN] Params:', JSON.stringify(request?.params?.request?.params, null, 2));
      console.log('[WC-IN] ==================================\n');

      const sessions = w.getActiveSessions();
      if (!request?.topic || !sessions || !sessions[request.topic]) {
        console.error('[WC-IN] Topic introuvable ou expiré:', request?.topic);
        try {
          await w.respondSessionRequest({
            topic: request.topic,
            response: {
              id: request.id,
              jsonrpc: '2.0',
              error: { code: 5100, message: 'Invalid or expired session' }
            }
          });
        } catch (e) {
          console.error('[WC-IN] Impossible de renvoyer l\'erreur (session morte):', e);
        }
        return; // Bloque la demande pour ne pas déranger l'utilisateur
      }
      const method: string = request?.params?.request?.method ?? '';
      // Changement de réseau demandé par la dApp : traité sans écran de signature.
      if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') {
        const raw = request?.params?.request?.params?.[0]?.chainId;
        const wanted = typeof raw === 'string' ? parseInt(raw, 16) : Number(raw);
        const target = evmChains().find((c) => c.evmChainId === wanted);
        const session = sessions[request.topic];
        const allowed = target && (session?.namespaces?.eip155?.chains ?? []).includes(target.caip);
        if (target && allowed) {
          useWallet.getState().setActiveChain(target.kalyxId);
          await w.respondSessionRequest({ topic: request.topic, response: { id: request.id, jsonrpc: '2.0', result: null } });
          w.emitSessionEvent({ topic: request.topic, event: { name: 'chainChanged', data: target.evmChainId }, chainId: target.caip }).catch(() => {});
        } else {
          await w.respondSessionRequest({
            topic: request.topic,
            response: { id: request.id, jsonrpc: '2.0', error: { code: 4902, message: 'Unrecognized chain ID for this wallet/session.' } },
          });
        }
        return;
      }
      if (!SIGNING_METHODS.has(method)) {
        // Lecture / capacités : réponse immédiate, sans écran. Inconnue : erreur JSON-RPC standard.
        const acct = activeAccount();
        // Adresse EVM seulement : sans elle, aucun compte (jamais l'adresse Solana/TON du réseau affiché).
        const evmAddress = acct?.evmAddress;
        const caip: string = request?.params?.chainId ?? '';
        const evmId = caip.startsWith('eip155:') ? Number(caip.slice(7)) : undefined;
        let response: any;
        if (method === 'eth_accounts' || method === 'eth_requestAccounts') response = { result: evmAddress ? [evmAddress] : [] };
        else if (method === 'eth_chainId') response = { result: evmId ? `0x${evmId.toString(16)}` : '0x1' };
        else if (method === 'wallet_getCapabilities' || method === 'wallet_getPermissions' || method === 'wallet_requestPermissions') response = { result: {} };
        else if (method === 'solana_getAccounts' || method === 'solana_requestAccounts') response = { result: acct?.solAddress ? [{ pubkey: acct.solAddress }] : [] };
        else response = { error: { code: -32601, message: `Method not supported: ${method}` } };
        await w.respondSessionRequest({ topic: request.topic, response: { id: request.id, jsonrpc: '2.0', ...response } }).catch(() => {});
        return;
      }
      /*
       * TRANSACTION SANS DESTINATAIRE VALIDE refusée dès l'arrivée, comme dans le
       * navigateur : un `to` absent devient un DÉPLOIEMENT de contrat (le `data`
       * part comme code), un `to` malformé n'a rien à faire devant l'utilisateur.
       */
      if (method === 'eth_sendTransaction' && !isValidEvmAddress(String(request?.params?.request?.params?.[0]?.to ?? ''))) {
        await w.respondSessionRequest({
          topic: request.topic,
          response: { id: request.id, jsonrpc: '2.0', error: { code: 4200, message: 'Transaction without a valid recipient (contract deployment) is not supported' } },
        }).catch(() => {});
        return;
      }
      const q = [...get().requestQueue, request];
      set({ requestQueue: q, request: q[0] });
      const topic: string | undefined = request?.topic;
      const peer = topic ? w.getActiveSessions()?.[topic]?.peer?.metadata?.name : undefined;
      const label = tr(METHOD_LABELS[method] ?? 'wcReqGeneric');
      notifyIncoming(tr('notifWcActionTitle'), peer ? `${label} · ${peer}` : tr('notifWcActionOpen', { label }));
    });
    w.on('session_delete', () => get().refresh());
    // Réseau changé dans Kalyx → événement chainChanged vers les dApps connectées.
    useWallet.subscribe((state, prev) => {
      if (state.activeChain !== prev.activeChain) broadcastChainChanged(w, state.activeChain);
    });
    // Retour au premier plan : connexion au relais rétablie, pour les demandes entrantes comme pour nos envois.
    AppState.addEventListener('change', (st) => {
      if (st === 'active') void ensureRelay(w);
    });
    set({ wallet: w, ready: true });
    get().refresh();
    } finally {
      _wcInitializing = false;
    }
  },

  pair: async (uri) => {
    // Session leurre : pas de nouvelle connexion (elle se mêlerait aux vraies) — un échec réseau ordinaire.
    if (isDecoySession()) throw new WalletError('RPC_UNAVAILABLE', 'Relais indisponible');
    const normalized = uri.trim();
    if (!normalized.startsWith('wc:')) throw new Error('URI WalletConnect invalide');
    console.log('[KALYX-WC] pair:start', { walletReady: !!get().wallet });
    if (!get().wallet) await get().init();
    const wallet = get().wallet;
    console.log('[KALYX-WC] pair:after-init', { walletReady: !!wallet });
    if (!wallet) throw new Error('WalletConnect n’est pas configuré');
    await wallet.pair({ uri: normalized });
    console.log('[KALYX-WC] pair:done (en attente de la proposition du site)');
  },

  approveProposal: async (unlock, perms, accountIndex) => {
    const { wallet, proposal } = get();
    console.log('[KALYX-WC] approve:start', { wallet: !!wallet, proposal: !!proposal, sdkUtils: !!sdkUtils });
    if (!wallet || !proposal || !sdkUtils) return;
    const p = perms ?? { tx: true, sign: true };
    // Méthodes autorisées selon les cases cochées (lecture toujours accordée via
    // le partage des adresses ; ici on gère uniquement les actions signables).
    const evmMethods = [
      'eth_accounts', 'eth_requestAccounts', 'eth_chainId', 'wallet_switchEthereumChain', 'wallet_addEthereumChain', 'wallet_getCapabilities',
      ...(p.tx ? ['eth_sendTransaction'] : []),
      ...(p.sign ? ['personal_sign', 'eth_sign', 'eth_signTypedData', 'eth_signTypedData_v3', 'eth_signTypedData_v4'] : []),
    ];
    const solMethods = ['solana_getAccounts', ...(p.tx ? ['solana_signTransaction', 'solana_signAllTransactions', 'solana_signAndSendTransaction'] : []), ...(p.sign ? ['solana_signMessage'] : [])];
    const btcMethods = ['getAccountAddresses', 'getAccounts', ...(p.tx ? ['signPsbt', 'sendTransaction', 'sendTransfer'] : []), ...(p.sign ? ['signMessage'] : [])];
    const wstate = useWallet.getState();
    /*
     * Compte partagé avec la dApp. Choisi par l'utilisateur à la connexion
     * quand il en a plusieurs : une session WalletConnect se noue avec UN
     * compte et ne peut plus en changer ensuite, donc le choix doit se faire
     * maintenant ou jamais.
     */
    const wanted = accountIndex ?? wstate.activeAccountIndex;
    const acct = wstate.accounts.find((a) => a.index === wanted) ?? wstate.accounts[0];
    /*
     * Chaque espace de noms reçoit SON adresse. Avant, un portefeuille sans
     * adresse EVM (clé Solana importée) s'annonçait en eip155 avec son adresse
     * Solana ; désormais il se connecte en Solana seulement.
     */
    if (!acct?.evmAddress && !acct?.solAddress && !acct?.btcAddress) throw new WcConnectError('NO_ACCOUNT');
    // Exige l'identité dès la connexion (parité avec le navigateur dApps intégré).
    // Biométrie ou PIN ; lève si refusée → l'UI affiche l'erreur, aucune session.
    // Lecture seule : l'adresse suivie n'est PAS celle de l'utilisateur, on ne la présente pas comme telle.
    await wstate.verifyConnect(unlock);
    const chains = evmChains();
    const evmAddress = acct.evmAddress;
    const supportedNamespaces: Record<string, unknown> = {};
    if (evmAddress) {
      supportedNamespaces.eip155 = {
        chains: chains.map((c) => c.caip),
        methods: evmMethods,
        events: ['chainChanged', 'accountsChanged'],
        accounts: chains.map((c) => `${c.caip}:${evmAddress}`),
      };
    }
    // Solana (namespace WalletConnect « solana »).
    if (acct.solAddress) {
      supportedNamespaces.solana = {
        chains: [SOLANA_CAIP],
        methods: solMethods,
        events: ['accountsChanged'],
        accounts: [`${SOLANA_CAIP}:${acct.solAddress}`],
      };
    }
    // Bitcoin (namespace « bip122 »).
    if (acct.btcAddress) {
      supportedNamespaces.bip122 = {
        chains: [BTC_CAIP],
        methods: btcMethods,
        events: [],
        accounts: [`${BTC_CAIP}:${acct.btcAddress}`],
      };
    }
    let namespaces: Record<string, unknown>;
    try {
      namespaces = sdkUtils.buildApprovedNamespaces({
        proposal: proposal.params,
        supportedNamespaces,
      });
    } catch (e) {
      /*
        buildApprovedNamespaces jette si la dApp EXIGE un réseau ou une méthode
        hors de notre liste. Le détail technique est CONSERVÉ : « réseau non
        supporté » sans dire lequel oblige à chercher, et c'est ce genre de
        silence qui coûte des heures.
      */
      const detail = e instanceof Error ? e.message : String(e);
      throw new WcConnectError('UNSUPPORTED_REQUEST', detail.slice(0, 160));
    }
    if (!namespaces || Object.keys(namespaces).length === 0) {
      throw new WcConnectError('NO_COMPATIBLE_CHAIN');
    }
    try {
      await wallet.approveSession({ id: proposal.id, namespaces: namespaces as any });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      if (/expired|deleted|record/i.test(detail)) {
        // On laisse la fenêtre ouverte pour afficher l'erreur ; « Refuser » la fermera.
        throw new WcConnectError('PROPOSAL_EXPIRED');
      }
      throw new WcConnectError('REJECTED_BY_RELAY', detail.slice(0, 160));
    }
    set({ proposal: null });
    get().refresh();
  },

  rejectProposal: async () => {
    const { wallet, proposal } = get();
    if (wallet && proposal && sdkUtils) {
      await wallet.rejectSession({ id: proposal.id, reason: sdkUtils.getSdkError('USER_REJECTED') });
    }
    set({ proposal: null });
  },

  approveRequest: async (unlock, overrideData) => {
    const { wallet, requestQueue } = get();
    const request = requestQueue[0];
    if (!wallet || !request) return;
    const { topic, params, id } = request;
    const method: string = params.request.method;
    const p = params.request.params;
    
    
    const chain = evmChains().find((c) => c.caip === params.chainId);
    const w = useWallet.getState();

    try {
      let result: any;
      /*
       * Liste blanche en vigueur : TOUTE signature de dApp est refusée — y compris
       * un simple message, qui peut autoriser un transfert (transaction Safe,
       * ordre hors chaîne). Seule la lecture des comptes reste possible.
       */
      if (!/getAccounts|getAccountAddresses|requestAccounts/i.test(method)) await (await import('./whitelistStore')).assertDappAllowed();
      if (method === 'personal_sign' || method === 'eth_sign') result = await w.signMessage(unlock, signMessageParam(method, p));
      else if (method.startsWith('eth_signTypedData')) {
        const data = typeof p[1] === 'string' ? JSON.parse(p[1]) : p[1];
        // Réseau de la REQUÊTE (eip155:<id>) : un domain.chainId différent est refusé par le coffre.
        const reqChain = typeof params.chainId === 'string' && params.chainId.startsWith('eip155:') ? Number(params.chainId.slice(7)) : undefined;
        result = await w.signTypedData(unlock, data, reqChain);
      } else if (method === 'eth_sendTransaction') {
        if (!chain) throw new Error('Réseau de la requête non supporté');
        const tx = p[0];
        // Défense en profondeur (déjà refusé à l'arrivée) : jamais de déploiement ni d'adresse malformée.
        if (typeof tx?.to !== 'string' || !isValidEvmAddress(tx.to)) throw new Error('Destinataire de la transaction invalide');
        // Préparée pour un autre compte que celui qui signerait : refus plutôt qu'envoi depuis le mauvais compte.
        const signer = w.accounts.find((a) => a.index === w.activeAccountIndex)?.evmAddress ?? '';
        if (typeof tx?.from === 'string' && signer && tx.from.toLowerCase() !== signer.toLowerCase()) throw new WalletError('WRONG_ACCOUNT', 'from ≠ compte actif', { address: shortAddress(tx.from) });
        const req: RawTxRequest = {
          to: tx.to,
          data: overrideData ?? tx.data ?? '0x',
          value: tx.value ? BigInt(tx.value) : 0n,
          chainId: chain.evmChainId,
          gasLimit: tx.gas ? BigInt(tx.gas) : undefined,
        };
        result = await w.sendRawTxOn(unlock, chain.kalyxId, req);
      } else if (method === 'solana_signTransaction') {
        const pSafe: any = p || {};
        let txStr = pSafe.transaction || pSafe[0]?.transaction;
        if (!txStr && Array.isArray(pSafe)) txStr = pSafe.filter(x => typeof x === 'string').pop();
        if (!txStr && typeof pSafe === 'string') txStr = pSafe;
        if (typeof txStr !== 'string') throw new Error('Expected String');
        const res = await w.signSolanaTransaction(unlock, txStr);
        const solAddr = activeAccount()?.solAddress;
        result = { signature: extractSolanaSignature(res, solAddr || ''), transaction: ensureBase64(res) };
      } else if (method === 'solana_signAndSendTransaction') {
        // Signe puis diffuse : la dApp attend { signature } (base58 de la transaction envoyée).
        const pSafe: any = p || {};
        const txStr = pSafe.transaction ?? pSafe[0]?.transaction ?? (typeof pSafe === 'string' ? pSafe : undefined);
        if (typeof txStr !== 'string') throw new Error('Expected String');
        const signed = await w.signSolanaTransaction(unlock, txStr);
        const sig = await submitSolanaSigned(ensureBase64(signed));
        result = { signature: sig };
      } else if (method === 'solana_signAllTransactions') {
        const pSafe: any = p || {};
        let txStrArray = pSafe.transactions || pSafe[0]?.transactions || (Array.isArray(pSafe) ? pSafe : [pSafe]);
        if (!Array.isArray(txStrArray)) txStrArray = [txStrArray];
        const res = await w.signSolanaTransactions(unlock, txStrArray);
        const solAddr = activeAccount()?.solAddress;
        result = { signatures: res.map(r => extractSolanaSignature(r, solAddr || '')), transactions: res.map(ensureBase64) };
      } else if (method === 'solana_signMessage') {
        const pSafe: any = p || {};
        let msg = pSafe.message ?? pSafe.msg ?? pSafe.signMessage;
        if (!msg && Array.isArray(pSafe)) {
          msg = pSafe[0]?.message ?? pSafe[0]?.msg ?? pSafe[0];
        }
        if (!msg && typeof pSafe === 'string') msg = pSafe;
        if (typeof msg !== 'string') throw new Error('Expected String');
        const res = await w.signSolanaMessage(unlock, msg);
        const sig = typeof res === 'object' && res.signature ? res.signature : res;
        result = { signature: sig };
      } else if (method === 'bitcoin_signMessage' || method === 'signMessage') {
        const pSafe: any = p || {};
        let msg = pSafe.message || pSafe[0]?.message;
        if (!msg && Array.isArray(pSafe)) msg = pSafe.filter(x => typeof x === 'string').pop();
        if (!msg && typeof pSafe === 'string') msg = pSafe;
        if (typeof msg !== 'string') throw new Error('Expected String');
        /*
         * PROTOCOLE DE SIGNATURE — la cause des « Invalid signature length ».
         *
         * Les deux protocoles produisent des tailles TRÈS différentes :
         *  - ECDSA / BIP-137 : 65 octets (1 en-tête 39+recovery pour P2WPKH,
         *    puis r et s), soit 88 caractères en base64 ;
         *  - BIP-322 : la pile de témoin sérialisée, 108 octets pour un
         *    P2WPKH, soit 144 caractères.
         * Se tromper de protocole ne donne donc pas « signature invalide » mais
         * une erreur de LONGUEUR, qui ne dit rien sur la cause.
         *
         * DÉFAUT : BIP-322 pour une adresse SegWit natif (bc1q…), ECDSA sinon.
         *
         * Mesuré, pas supposé : sur https://react-app.walletconnect.com — le
         * dApp de référence de WalletConnect — une requête SANS champ
         * `protocol` reçoit notre signature BIP-137 de 65 octets (vérifiée
         * correcte : en-tête 39+recovery, r et s) et la rejette avec « Invalid
         * signature length ». Un vérificateur qui voulait de l'ECDSA aurait
         * accepté 65 octets. Il vérifie donc en BIP-322, qui est de fait le
         * standard des adresses bech32 et ce que font Unisat, Xverse et Leather.
         *
         * Les adresses héritées (1…, 3…) restent en ECDSA : BIP-322 y est peu
         * répandu. Et un `protocol` explicite gagne toujours sur ce défaut.
         */
        const btcAddrForProto = activeAccount()?.btcAddress ?? String(pSafe.address ?? pSafe[0]?.address ?? '');
        const isBech32 = /^(bc1|tb1)/i.test(btcAddrForProto);
        const requested = pSafe.protocol ?? pSafe[0]?.protocol;
        const proto = String(requested ?? (isBech32 ? 'bip322' : 'ecdsa')).toLowerCase();
        const type: 'ecdsa' | 'bip322' = proto.startsWith('bip322') ? 'bip322' : 'ecdsa';
        const sigBase64 = await w.signBitcoinMessage(unlock, msg, type);
        /*
         * Journalisé pour que le prochain échec soit diagnosticable d'un coup.
         * La taille est DÉCODÉE et non estimée : `base64.length * 3 / 4`
         * comptait le caractère de remplissage et annonçait 66 octets pour une
         * signature de 65, ce qui a fait croire à un format inattendu.
         */
        technicalLogger.logDapp('btc_signMessage', undefined, {
          chain: 'bitcoin',
          requestedProtocol: requested ?? '(absent)',
          resolvedProtocol: type,
          addressKind: isBech32 ? 'bech32 (segwit natif)' : 'héritée',
          signatureBytes: base64.decode(sigBase64).length,
          messageBytes: utf8ToBytes(msg).length,
        });
        const btcAddr = activeAccount()?.btcAddress ?? pSafe.address ?? pSafe[0]?.address;
        // Spec Reown : signature en base64 + adresse signataire.
        result = { signature: sigBase64, address: btcAddr };
      } else if (method === 'bitcoin_signPsbt' || method === 'signPsbt') {
        const pSafe: any = p || {};
        let psbtStr = pSafe.psbt || pSafe[0]?.psbt;
        if (!psbtStr && Array.isArray(pSafe)) psbtStr = pSafe.filter(x => typeof x === 'string').pop();
        if (!psbtStr && typeof pSafe === 'string') psbtStr = pSafe;
        if (typeof psbtStr !== 'string') throw new Error('Expected String for PSBT');
        
        const finalize = pSafe.finalize ?? pSafe[0]?.finalize ?? true;
        
        // Extract inputsToSign or signInputs
        const rawInputs = pSafe.inputsToSign || pSafe.signInputs || pSafe[0]?.inputsToSign || pSafe[0]?.signInputs;
        let signInputs: number[] | undefined = undefined;
        if (Array.isArray(rawInputs)) {
          signInputs = rawInputs.flatMap((item: any) => {
            if (typeof item === 'number') return [item];
            if (item && typeof item.index === 'number') return [item.index];
            if (item && Array.isArray(item.signingIndexes)) return item.signingIndexes;
            return [];
          });
        }
        
        const broadcast = pSafe.broadcast === true || pSafe[0]?.broadcast === true;
        const resStr = await w.signBitcoinPsbt(unlock, psbtStr, { finalize: finalize || broadcast, signInputs });
        let txid: string | undefined;
        if (broadcast) {
          const isHex = resStr.toLowerCase().startsWith('70736274');
          /*
           * `hex.decode` et non `Buffer.from` : `Buffer` n'est PAS un global de
           * React Native, et ce chemin — signer puis diffuser un PSBT pour une
           * dApp — aurait levé dans l'app tout en passant en test, où Node le
           * fournit.
           */
          const bytes = isHex ? hex.decode(resStr) : base64.decode(resStr);
          const signed = BtcTransaction.fromPSBT(bytes);
          txid = await (getAdapter('bitcoin') as any).broadcastHex(signed.hex);
        }
        result = txid ? { psbt: resStr, txid } : { psbt: resStr };
      } else if (method === 'bitcoin_getAccounts' || method === 'getAccountAddresses' || method === 'bitcoin_getAccountAddresses') {
        /*
         * PAR LE COFFRE. Ce chemin relisait la PHRASE complète (`revealPhrase`)
         * et dérivait la graine ici, sans jamais l'effacer — hors du seul
         * module autorisé à la toucher. `deriveSigner` fait la même dérivation
         * (compte actif, BIP-84) et efface graine et clé après usage.
         */
        const btcModule = await import('../src/crypto/btc');
        const index = w.account?.index || 0;
        const publicKey = await withSigner(await w.deriveSigner(getAdapterV2('bitcoin'), unlock), async (s) => {
          assertCurve(s, 'secp256k1');
          return new Uint8Array(s.publicKey);
        });
        result = [{ address: btcModule.p2wpkhAddress(publicKey), publicKey: hex.encode(publicKey), path: `m/84'/0'/0'/0/${index}`, intention: 'payment', purpose: 'payment' }];
      } else if (method === 'bitcoin_sendTransaction' || method === 'sendTransfer') {
        // Build, sign, broadcast and return txid
        const pSafe: any = p || {};
        const to = pSafe.recipientAddress || pSafe.recipient || pSafe.to || pSafe[0]?.recipientAddress || pSafe[0]?.recipient || pSafe[0]?.to || pSafe[0];
        const amountStr = String(pSafe.amount || pSafe[0]?.amount || pSafe[1] || 0);
        if (!to || typeof to !== 'string') throw new Error('Expected String for recipientAddress');
        const adapter = getAdapter('bitcoin');
        const btcModule = await import('../src/crypto/btc');
        // Clé dérivée par le coffre, effacée après la signature (même en cas d'erreur).
        const txid = await withSigner(await w.deriveSigner(getAdapterV2('bitcoin'), unlock), (s) => {
          assertCurve(s, 'secp256k1');
          return (adapter as any).sendBitcoin(btcModule.p2wpkhAddress(s.publicKey), to, amountStr, {
            privateKey: s.privateKey,
            publicKey: s.publicKey,
          });
        });
        result = { txid };
      } else {
        throw new Error(`Méthode non supportée : ${method}`);
      }
      
      console.log('\n[WC-SUCCESS] === RESPONDING WITH SUCCESS ===');
      console.log('[WC-SUCCESS] Method:', method);
      console.log('[WC-SUCCESS] Result payload:', JSON.stringify(result, null, 2));
      console.log('[WC-SUCCESS] =====================================\n');

      await wallet.respondSessionRequest({ topic, response: { id, jsonrpc: '2.0', result } });
      const q = get().requestQueue.slice(1); set({ requestQueue: q, request: q[0] ?? null });
      if (q.length === 0) returnToDapp(wallet, topic);
    } catch (e) {
      console.error('\n[WC-ERROR] === RESPONDING WITH ERROR ===');
      console.error('[WC-ERROR] Method:', method);
      console.error('[WC-ERROR] Error object:', e);
      console.error('[WC-ERROR] Error message:', e instanceof Error ? e.message : 'Unknown error');
      console.error('[WC-ERROR] ===============================\n');
      if (wallet && sdkUtils) {
        await wallet.respondSessionRequest({
          topic,
          response: { id, jsonrpc: '2.0', error: { code: 5000, message: errorText(e) } },
        });
      }
      handleSmartError(e);
      const q = get().requestQueue.slice(1); set({ requestQueue: q, request: q[0] ?? null });
      throw e;
    }
  },

  rejectRequest: async () => {
    const { wallet, requestQueue } = get();
    const request = requestQueue[0];
    if (wallet && request && sdkUtils) {
      console.log('\n[WC-REJECT] === USER REJECTED REQUEST ===');
      console.log('[WC-REJECT] ID:', request.id);
      console.log('[WC-REJECT] Method:', request?.params?.request?.method);
      console.log('[WC-REJECT] =================================\n');
      await wallet.respondSessionRequest({
        topic: request.topic,
        response: { id: request.id, jsonrpc: '2.0', error: sdkUtils.getSdkError('USER_REJECTED') },
      });
    }
    const q = get().requestQueue.slice(1); set({ requestQueue: q, request: q[0] ?? null });
    if (q.length === 0) if (wallet) returnToDapp(wallet, request.topic);
  },

  disconnect: async (topic) => {
    if (isDecoySession()) return; // jamais toucher aux vraies connexions depuis le leurre
    await forceDisconnect(get().wallet, topic);
    get().refresh();
  },

  disconnectAddresses: async (addresses) => {
    if (isDecoySession()) return;
    const w = get().wallet;
    if (!w || !addresses.length) return;
    const mine = new Set(addresses.map((a) => a.toLowerCase()));
    const hit = Object.values(w.getActiveSessions()).filter((s: any) =>
      Object.values(s.namespaces ?? {}).some((ns: any) => (ns.accounts ?? []).some((acc: string) => mine.has(String(acc).split(':').pop()!.toLowerCase()))),
    );
    await Promise.all(hit.map((s: any) => forceDisconnect(w, s.topic)));
    get().refresh();
  },

  disconnectAll: async () => {
    if (isDecoySession()) return;
    const w = get().wallet;
    if (!w) return;
    const active = w.getActiveSessions();
    await Promise.all(Object.values(active).map((s: any) => forceDisconnect(w, s.topic)));
    get().refresh();
  },

  refresh: () => {
    // Session leurre : les vraies sessions ne sont jamais listées.
    if (isDecoySession()) return set({ sessions: [] });
    const w = get().wallet;
    if (!w) return;
    const active = w.getActiveSessions();
    set({
      sessions: Object.values(active).map((s: any) => ({
        topic: s.topic,
        name: s.peer?.metadata?.name ?? 'dApp',
        url: s.peer?.metadata?.url ?? '',
        icon: s.peer?.metadata?.icons?.[0],
      })),
    });
  },
}));
/* eslint-enable @typescript-eslint/no-explicit-any */
