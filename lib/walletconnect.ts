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
import { Platform } from 'react-native';
import { create } from 'zustand';
import { useWallet, type Unlock } from './walletStore';
import { listChains, type RawTxRequest } from '../src';
import type { IWeb3Wallet } from '@walletconnect/web3wallet';

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

export const useWalletConnect = create<WcState>((set, get) => ({
  configured: PROJECT_ID.length > 0,
  ready: false,
  wallet: null,
  sessions: [],
  proposal: null,
  request: null,

  init: async () => {
    if (!PROJECT_ID || get().wallet) return;
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

    w.on('session_proposal', (proposal: any) => set({ proposal }));
    w.on('session_request', (request: any) => set({ request }));
    w.on('session_delete', () => get().refresh());
    set({ wallet: w, ready: true });
    get().refresh();
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
    const solMethods = [...(p.tx ? ['solana_signTransaction'] : []), ...(p.sign ? ['solana_signMessage'] : [])];
    const btcMethods = [...(p.tx ? ['bitcoin_sendTransfer'] : []), ...(p.sign ? ['bitcoin_signMessage'] : [])];
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
    const { wallet, request } = get();
    if (!wallet || !request) return;
    const { topic, params, id } = request;
    const method: string = params.request.method;
    const p = params.request.params;
    const chain = evmChains().find((c) => c.caip === params.chainId);
    const w = useWallet.getState();

    let result: string;
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
    } else {
      throw new Error(`Méthode non supportée : ${method}`);
    }

    await wallet.respondSessionRequest({ topic, response: { id, jsonrpc: '2.0', result } });
    set({ request: null });
  },

  rejectRequest: async () => {
    const { wallet, request } = get();
    if (wallet && request && sdkUtils) {
      await wallet.respondSessionRequest({
        topic: request.topic,
        response: { id: request.id, jsonrpc: '2.0', error: sdkUtils.getSdkError('USER_REJECTED') },
      });
    }
    set({ request: null });
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
