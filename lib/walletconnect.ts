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
import { create } from 'zustand';
import { useWallet } from './walletStore';
import { listChains, type RawTxRequest } from '../src';
import type { IWeb3Wallet } from '@walletconnect/web3wallet';

const PROJECT_ID = process.env.EXPO_PUBLIC_WALLETCONNECT_ID || '';

// Utilitaires SDK chargés à l'init (import dynamique).
/* eslint-disable @typescript-eslint/no-explicit-any */
let sdkUtils: { buildApprovedNamespaces: (a: any) => any; getSdkError: (k: string) => any } | null = null;

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

const WC_METHODS = ['eth_sendTransaction', 'personal_sign', 'eth_sign', 'eth_signTypedData', 'eth_signTypedData_v4'];

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
  approveProposal: () => Promise<void>;
  rejectProposal: () => Promise<void>;
  approveRequest: (pin: string) => Promise<void>;
  rejectRequest: () => Promise<void>;
  disconnect: (topic: string) => Promise<void>;
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
    // Silence les warnings bénins du heartbeat WC (nettoyage de propositions
    // expirées : « Missing or invalid. Record was recently deleted - proposal »).
    for (const level of ['warn', 'error'] as const) {
      const orig = console[level].bind(console);
      console[level] = (...args: unknown[]) =>
        String(args[0]).includes('Record was recently deleted') ? undefined : orig(...args);
    }
    // Chargement dynamique : n'exécute le code natif qu'ici.
    await import('@walletconnect/react-native-compat');
    const [{ Core }, { Web3Wallet }, utils] = await Promise.all([
      import('@walletconnect/core'),
      import('@walletconnect/web3wallet'),
      import('@walletconnect/utils'),
    ]);
    sdkUtils = { buildApprovedNamespaces: utils.buildApprovedNamespaces, getSdkError: utils.getSdkError };

    const core = new Core({ projectId: PROJECT_ID });
    const w = (await Web3Wallet.init({
      core,
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

  approveProposal: async () => {
    const { wallet, proposal } = get();
    if (!wallet || !proposal || !sdkUtils) return;
    const address = useWallet.getState().account?.address;
    if (!address) throw new Error('Aucun compte actif');
    const chains = evmChains();
    let namespaces: Record<string, unknown>;
    try {
      namespaces = sdkUtils.buildApprovedNamespaces({
        proposal: proposal.params,
        supportedNamespaces: {
          eip155: {
            chains: chains.map((c) => c.caip),
            methods: WC_METHODS,
            events: ['chainChanged', 'accountsChanged'],
            accounts: chains.map((c) => `${c.caip}:${address}`),
          },
        },
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
      await wallet.approveSession({ id: proposal.id, namespaces });
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

  approveRequest: async (pin) => {
    const { wallet, request } = get();
    if (!wallet || !request) return;
    const { topic, params, id } = request;
    const method: string = params.request.method;
    const p = params.request.params;
    const chain = evmChains().find((c) => c.caip === params.chainId);
    const w = useWallet.getState();

    let result: string;
    if (method === 'personal_sign') result = await w.signMessage({ pin }, p[0]);
    else if (method === 'eth_sign') result = await w.signMessage({ pin }, p[1]);
    else if (method.startsWith('eth_signTypedData')) {
      const data = typeof p[1] === 'string' ? JSON.parse(p[1]) : p[1];
      result = await w.signTypedData({ pin }, data);
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
      result = await w.sendRawTxOn({ pin }, chain.novaId, req);
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
