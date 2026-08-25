import { base58, base64 } from '@scure/base';
/**
 * WalletConnect (Reown) — Nova est le WALLET auquel les dApps se connectent.
 * Flux : coller une URI wc: → proposition de session → approbation (compte actif
 * exposé) → requêtes (sign / tx) confirmées avec PIN.
 *
 * IMPORTANT : le SDK (+ async-storage natif) est chargé en IMPORT DYNAMIQUE dans
 * init(), pas au démarrage. Ainsi, tant que le dev build n'a pas été rebuild avec
 * les modules natifs, l'app ne crashe pas — WalletConnect reste simplement inactif.
 * La signature est déléguée au walletStore (la clé reste isolée).
 */
import { Platform, AppState } from 'react-native';
import { create } from 'zustand';
import { useWallet, type Unlock } from './walletStore';
import { notify } from './notifications';
import { listChains, getAdapter, type RawTxRequest } from '../src';
import { handleSmartError } from './errorHandler';
import type { IWeb3Wallet } from '@walletconnect/web3wallet';

// Libellé lisible d'une méthode WalletConnect (pour la notification de signature).


import { VersionedTransaction } from '@solana/web3.js';
function extractSolanaSignature(tx: string, address: string): string {
  try {
    const isBase64 = /^[a-zA-Z0-9+/]*={0,2}$/.test(tx) && tx.length % 4 === 0;
    const bytes = isBase64 ? base64.decode(tx) : base58.decode(tx);
    const vtx = VersionedTransaction.deserialize(bytes);
    const idx = vtx.message.staticAccountKeys.findIndex(k => k.toBase58() === address);
    if (idx >= 0 && vtx.signatures[idx]) {
      return base58.encode(vtx.signatures[idx]);
    }
    return base58.encode(vtx.signatures[0]);
  } catch {
    return tx;
  }
}

function ensureBase58(tx: string): string {
  const isBase64 = /^[a-zA-Z0-9+/]*={0,2}$/.test(tx) && tx.length % 4 === 0;
  if (!isBase64) return tx;
  try {
    return base58.encode(base64.decode(tx));
  } catch {
    return tx;
  }
}

const METHOD_LABELS: Record<string, string> = {
  eth_sendTransaction: 'Transaction à signer',
  personal_sign: 'Signature de message',
  eth_sign: 'Signature de message',
  eth_signTypedData: 'Signature de données',
  eth_signTypedData_v4: 'Signature de données',
  solana_signTransaction: 'Transaction Solana à signer',
  solana_signAllTransactions: 'Transactions Solana à signer',
  solana_signMessage: 'Signature de message',
  bitcoin_sendTransfer: 'Transaction Bitcoin à signer',
  bitcoin_sendTransaction: 'Transaction Bitcoin à signer',
  bitcoin_signPsbt: 'Transaction Bitcoin (PSBT) à signer',
  bitcoin_signMessage: 'Signature de message',
};

/** Notifie une demande entrante (proposition/requête) quand l'app n'est PAS au
 *  premier plan — appuyer sur la notification rouvre Nova, où la fenêtre de
 *  signature (WalletConnectHost) s'affiche déjà pour toute demande en attente. */
function notifyIncoming(title: string, body: string) {
  if (AppState.currentState === 'active') return; // au 1er plan : la modale suffit
  void notify(title, body);
}

const PROJECT_ID = process.env.EXPO_PUBLIC_WALLETCONNECT_ID || '';

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
    const orig = console[level].bind(console);
    console[level] = (...args: unknown[]) => (isBenign(args) ? undefined : orig(...args));
  }
}

interface EvmChain {
  caip: string;
  novaId: string;
  evmChainId: number;
}
function evmChains(): EvmChain[] {
  return listChains()
    .filter((c) => c.family === 'evm' && c.evmChainId)
    .map((c) => ({ caip: `eip155:${c.evmChainId}`, novaId: c.id, evmChainId: c.evmChainId! }));
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
  approveProposal: (unlock: Unlock, perms?: { tx: boolean; sign: boolean }) => Promise<void>;
  rejectProposal: () => Promise<void>;
  approveRequest: (unlock: Unlock) => Promise<void>;
  rejectRequest: () => Promise<void>;
  disconnect: (topic: string) => Promise<void>;
  /** Coupe TOUTES les sessions actives (ex. au verrouillage de Nova). */
  disconnectAll: () => Promise<void>;
  refresh: () => void;
}

let _wcInitializing = false;

export const useWalletConnect = create<WcState>((set, get) => ({
  configured: PROJECT_ID.length > 0,
  ready: false,
  wallet: null,
  sessions: [],
  proposal: null,
  requestQueue: [],
  request: null,

  init: async () => {
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
      metadata: { name: 'Nova Wallet', description: 'Wallet crypto non-custodial', url: 'https://nova.wallet', icons: [] },
    })) as IWeb3Wallet;

    w.on('session_proposal', (proposal: any) => {
      set({ proposal });
      const name = proposal?.params?.proposer?.metadata?.name;
      notifyIncoming('Nova · Connexion demandée', name ? `${name} veut se connecter à votre portefeuille` : 'Un site veut se connecter à votre portefeuille');
    });
    w.on('session_request', (request: any) => {
      console.log('\n[WC-IN] === SESSION_REQUEST RECEIVED ===');
      console.log('[WC-IN] ID:', request?.id);
      console.log('[WC-IN] Topic:', request?.topic);
      console.log('[WC-IN] Method:', request?.params?.request?.method);
      console.log('[WC-IN] Params:', JSON.stringify(request?.params?.request?.params, null, 2));
      console.log('[WC-IN] ==================================\n');
      const q = [...get().requestQueue, request];
      set({ requestQueue: q, request: q[0] });
      const method: string = request?.params?.request?.method ?? '';
      const topic: string | undefined = request?.topic;
      const peer = topic ? w.getActiveSessions()?.[topic]?.peer?.metadata?.name : undefined;
      const label = METHOD_LABELS[method] ?? 'Signature demandée';
      notifyIncoming('Nova · Action à valider', peer ? `${label} · ${peer}` : `${label} — appuyez pour ouvrir`);
    });
    w.on('session_delete', () => get().refresh());
    set({ wallet: w, ready: true });
    get().refresh();
    } finally {
      _wcInitializing = false;
    }
  },

  pair: async (uri) => {
    await get().wallet?.pair({ uri: uri.trim() });
  },

  approveProposal: async (unlock, perms) => {
    const { wallet, proposal } = get();
    if (!wallet || !proposal || !sdkUtils) return;
    const p = perms ?? { tx: true, sign: true };
    // Méthodes autorisées selon les cases cochées (lecture toujours accordée via
    // le partage des adresses ; ici on gère uniquement les actions signables).
    const evmMethods = [
      ...(p.tx ? ['eth_sendTransaction'] : []),
      ...(p.sign ? ['personal_sign', 'eth_sign', 'eth_signTypedData', 'eth_signTypedData_v4'] : []),
    ];
    const solMethods = ['solana_getAccounts', ...(p.tx ? ['solana_signTransaction', 'solana_signAllTransactions'] : []), ...(p.sign ? ['solana_signMessage'] : [])];
    const btcMethods = ['getAccountAddresses', 'getAccounts', ...(p.tx ? ['signPsbt', 'sendTransaction', 'sendTransfer'] : []), ...(p.sign ? ['signMessage'] : [])];
    const wstate = useWallet.getState();
    const address = wstate.account?.address;
    if (!address) throw new Error('Aucun compte actif');
    // Exige l'identité dès la connexion (parité avec le navigateur dApps intégré).
    // Biométrie ou PIN ; lève si refusée → l'UI affiche l'erreur, aucune session.
    await wstate.verifyUnlock(unlock);
    const chains = evmChains();
    // Adresses non-EVM du compte actif (partagées en lecture seule au dashboard).
    const acct = wstate.accounts[wstate.activeAccountIndex];
    const evmAddress = acct?.evmAddress || address;
    const supportedNamespaces: Record<string, unknown> = {
      eip155: {
        chains: chains.map((c) => c.caip),
        methods: evmMethods,
        events: ['chainChanged', 'accountsChanged'],
        accounts: chains.map((c) => `${c.caip}:${evmAddress}`),
      },
    };
    // Solana (namespace WalletConnect « solana »).
    if (acct?.solAddress) {
      supportedNamespaces.solana = {
        chains: [SOLANA_CAIP],
        methods: solMethods,
        events: ['accountsChanged'],
        accounts: [`${SOLANA_CAIP}:${acct.solAddress}`],
      };
    }
    // Bitcoin (namespace « bip122 »).
    if (acct?.btcAddress) {
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
      // buildApprovedNamespaces jette si la dApp EXIGE un réseau/une méthode
      // hors de notre liste (ex. Solana). Message clair plutôt que silence.
      const detail = e instanceof Error ? e.message : String(e);
      throw new Error(`Cette dApp demande un réseau ou une méthode non supportés par Nova. (${detail.slice(0, 120)})`);
    }
    if (!namespaces || Object.keys(namespaces).length === 0) {
      throw new Error('Cette dApp ne demande aucun réseau compatible (EVM).');
    }
    try {
      await wallet.approveSession({ id: proposal.id, namespaces: namespaces as any });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      if (/expired|deleted|record/i.test(detail)) {
        // On laisse la fenêtre ouverte pour afficher l'erreur ; « Refuser » la fermera.
        throw new Error('La demande de connexion a expiré. Relance la connexion depuis la dApp.');
      }
      throw new Error(`Connexion refusée par WalletConnect : ${detail.slice(0, 140)}`);
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

  approveRequest: async (unlock) => {
    const { wallet, requestQueue } = get();
    const request = requestQueue[0];
    if (!wallet || !request) return;
    const { topic, params, id } = request;
    const method: string = params.request.method;
    const p = params.request.params;
    
    console.log('\n[WC-PROCESSING] === START PROCESSING ===');
    console.log('[WC-PROCESSING] Method:', method);
    console.log('[WC-PROCESSING] Params:', JSON.stringify(p, null, 2));
    
    const chain = evmChains().find((c) => c.caip === params.chainId);
    const w = useWallet.getState();

    try {
      let result: any;
      if (method === 'personal_sign') result = await w.signMessage(unlock, p[0]);
      else if (method === 'eth_sign') result = await w.signMessage(unlock, p[1]);
      else if (method.startsWith('eth_signTypedData')) {
        const data = typeof p[1] === 'string' ? JSON.parse(p[1]) : p[1];
        result = await w.signTypedData(unlock, data);
      } else if (method === 'eth_sendTransaction') {
        if (!chain) throw new Error('Réseau de la requête non supporté');
        const tx = p[0];
        const req: RawTxRequest = {
          to: tx.to,
          data: tx.data ?? '0x',
          value: tx.value ? BigInt(tx.value) : 0n,
          chainId: chain.evmChainId,
          gasLimit: tx.gas ? BigInt(tx.gas) : undefined,
        };
        result = await w.sendRawTxOn(unlock, chain.novaId, req);
      } else if (method === 'solana_signTransaction') {
        const pSafe: any = p || {};
        let txStr = pSafe.transaction || pSafe[0]?.transaction;
        if (!txStr && Array.isArray(pSafe)) txStr = pSafe.filter(x => typeof x === 'string').pop();
        if (!txStr && typeof pSafe === 'string') txStr = pSafe;
        if (typeof txStr !== 'string') throw new Error('Expected String');
        const res = await w.signSolanaTransaction(unlock, txStr);
        const solAddr = useWallet.getState().accounts[useWallet.getState().activeAccountIndex]?.solAddress;
        result = { signature: extractSolanaSignature(res, solAddr || ""), transaction: ensureBase58(res) };
      } else if (method === 'solana_signAllTransactions') {
        const pSafe: any = p || {};
        let txStrArray = pSafe.transactions || pSafe[0]?.transactions || (Array.isArray(pSafe) ? pSafe : [pSafe]);
        if (!Array.isArray(txStrArray)) txStrArray = [txStrArray];
        const res = await w.signSolanaTransactions(unlock, txStrArray);
        const solAddr = useWallet.getState().accounts[useWallet.getState().activeAccountIndex]?.solAddress;
        result = { signatures: res.map(r => extractSolanaSignature(r, solAddr || "")), transactions: res.map(ensureBase58) };
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
        let type = 'ecdsa';
        if (pSafe.type === 'bip322-simple' || pSafe[0]?.type === 'bip322-simple') type = 'bip322';
        const sigBase64 = await w.signBitcoinMessage(unlock, msg, type as 'ecdsa'|'bip322');
        const sigHex = require('buffer').Buffer.from(sigBase64, 'base64').toString('hex');
        console.log('\n[DEBUG-VERIFY] Sig hex length:', sigHex.length, '\n');
        result = { signature: sigHex };
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
        
        const resStr = await w.signBitcoinPsbt(unlock, psbtStr, { finalize, signInputs });
        result = { psbt: resStr };
      } else if (method === 'bitcoin_getAccounts' || method === 'getAccountAddresses' || method === 'bitcoin_getAccountAddresses') {
        const btcModule = await import('../src/crypto/btc');
        const mnemonicModule = await import('../src/crypto/mnemonic');
        const activeWallet = w.wallets.find(x => x.id === w.activeWalletId);
        if (!activeWallet || activeWallet.type === 'privateKey') throw new Error('Bitcoin accounts not available for PK wallet');
        const secret = mnemonicModule.mnemonicToSeedSync(await w.revealPhrase(unlock));
        const derived = btcModule.deriveBtcAccount(secret, w.account?.index || 0);
        result = [{ address: derived.address, publicKey: derived.publicKey.replace(/^0x/, ''), purpose: 'payment' }];
      } else if (method === 'bitcoin_sendTransaction' || method === 'sendTransfer') {
        // Build, sign, broadcast and return txid
        const pSafe: any = p || {};
        const to = pSafe.recipientAddress || pSafe.recipient || pSafe.to || pSafe[0]?.recipientAddress || pSafe[0]?.recipient || pSafe[0]?.to || pSafe[0];
        const amountStr = String(pSafe.amount || pSafe[0]?.amount || pSafe[1] || 0);
        if (!to || typeof to !== 'string') throw new Error('Expected String for recipientAddress');
        const adapter = getAdapter('bitcoin');
        
        const btcModule = await import('../src/crypto/btc');
        const mnemonicModule = await import('../src/crypto/mnemonic');
        const secret = mnemonicModule.mnemonicToSeedSync(await w.revealPhrase(unlock));
        const btcSigner = btcModule.deriveBtcSigner(secret, w.account?.index || 0);
        
        const txid = await (adapter as any).sendBitcoin(btcSigner.address, to, amountStr, {
          privateKey: btcSigner.privateKey,
          publicKey: btcSigner.publicKey,
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
    } catch (e) {
      console.error('\n[WC-ERROR] === RESPONDING WITH ERROR ===');
      console.error('[WC-ERROR] Method:', method);
      console.error('[WC-ERROR] Error object:', e);
      console.error('[WC-ERROR] Error message:', e instanceof Error ? e.message : 'Unknown error');
      console.error('[WC-ERROR] ===============================\n');
      if (wallet && sdkUtils) {
        await wallet.respondSessionRequest({
          topic,
          response: { id, jsonrpc: '2.0', error: { code: 5000, message: e instanceof Error ? e.message : 'Unknown error' } },
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
  },

  disconnect: async (topic) => {
    if (sdkUtils) await get().wallet?.disconnectSession({ topic, reason: sdkUtils.getSdkError('USER_DISCONNECTED') });
    get().refresh();
  },

  disconnectAll: async () => {
    const w = get().wallet;
    if (!w || !sdkUtils) return;
    const active = w.getActiveSessions();
    await Promise.all(
      Object.values(active).map((s: any) =>
        w.disconnectSession({ topic: s.topic, reason: sdkUtils!.getSdkError('USER_DISCONNECTED') }).catch(() => {}),
      ),
    );
    get().refresh();
  },

  refresh: () => {
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
