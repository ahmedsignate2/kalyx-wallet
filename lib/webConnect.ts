/**
 * Connexion WalletConnect CÔTÉ dApp — pour le tableau de bord WEB.
 *
 * Modèle : le téléphone (app Nova) est le coffre-fort ; ce site est juste une
 * fenêtre. Le site NE stocke NI seed NI clé privée. Il ouvre une session
 * WalletConnect (QR), reçoit uniquement les adresses publiques, et FORWARDE
 * toute action sensible (envoi/signature) à l'app Nova qui signe avec PIN/bio.
 * Le web ne peut jamais signer seul.
 *
 * Multi-chaîne : on demande TOUS les réseaux EVM de Nova (optionalNamespaces),
 * le wallet approuve ceux qu'il supporte, et le dashboard permet d'en changer.
 */
import { create } from 'zustand';
import SignClient from '@walletconnect/sign-client';
import { listChains } from '../src';

const PROJECT_ID = process.env.EXPO_PUBLIC_WALLETCONNECT_ID || '';

type Status = 'idle' | 'connecting' | 'connected' | 'error';

interface WebConnectState {
  status: Status;
  uri: string | null; // URI WalletConnect à afficher en QR
  topic: string | null;
  address: string | null;
  chains: number[]; // tous les chainId EVM approuvés par le wallet
  chainId: number; // réseau sélectionné dans le dashboard
  error: string | null;
  init: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  setChain: (evmChainId: number) => void;
  /** Forwarde une requête à signer vers l'app Nova. Renvoie le résultat (hash/sig). */
  request: (method: string, params: unknown[]) => Promise<string>;
  reset: () => void;
}

let client: InstanceType<typeof SignClient> | null = null;

/** CAIP eip155 de tous les réseaux EVM connus de Nova. */
function evmCaips(): string[] {
  return listChains()
    .filter((c) => c.family === 'evm' && c.evmChainId)
    .map((c) => `eip155:${c.evmChainId}`);
}

/** accounts WC (« eip155:1:0x… ») → { address, chains[] }. */
function parseAccounts(accounts: string[]): { address: string; chains: number[] } {
  const set = new Set<number>();
  let address = '';
  for (const a of accounts) {
    const [ns, id, addr] = a.split(':');
    if (ns === 'eip155' && id && addr) {
      address = addr;
      set.add(Number(id));
    }
  }
  return { address, chains: [...set].sort((a, b) => a - b) };
}

export const useWebConnect = create<WebConnectState>((set, get) => ({
  status: 'idle',
  uri: null,
  topic: null,
  address: null,
  chains: [],
  chainId: 1,
  error: null,

  init: async () => {
    if (client || !PROJECT_ID) return;
    client = await SignClient.init({
      projectId: PROJECT_ID,
      metadata: {
        name: 'Nova Wallet',
        description: 'Tableau de bord Nova — votre portefeuille, en lecture seule',
        url: (globalThis as { location?: { origin: string } }).location?.origin ?? 'https://nova.wallet',
        icons: [],
      },
    });
    // Restaure une session existante (rechargement de page).
    const sessions = client.session.getAll();
    const last = sessions[sessions.length - 1];
    if (last) {
      const { address, chains } = parseAccounts(last.namespaces?.eip155?.accounts ?? []);
      if (address) {
        set({ status: 'connected', topic: last.topic, address, chains, chainId: chains.includes(1) ? 1 : chains[0] ?? 1, uri: null });
      }
    }
    client.on('session_delete', () => get().reset());
  },

  connect: async () => {
    if (!PROJECT_ID) {
      set({ status: 'error', error: 'EXPO_PUBLIC_WALLETCONNECT_ID manquant dans .env' });
      return;
    }
    set({ status: 'connecting', uri: null, error: null });
    try {
      await get().init();
      if (!client) throw new Error('client indisponible');
      const methods = ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData', 'eth_signTypedData_v4'];
      const events = ['chainChanged', 'accountsChanged'];
      const caips = evmCaips();
      const { uri, approval } = await client.connect({
        // Minimal obligatoire (Ethereum) + TOUS les réseaux EVM en optionnel :
        // le wallet approuve ceux qu'il supporte sans rejeter la session.
        requiredNamespaces: { eip155: { methods, chains: ['eip155:1'], events } },
        optionalNamespaces: { eip155: { methods, chains: caips, events } },
      });
      if (uri) set({ uri });
      const session = await approval(); // résolu quand le téléphone approuve
      const { address, chains } = parseAccounts(session.namespaces?.eip155?.accounts ?? []);
      if (!address) throw new Error('Aucune adresse reçue');
      set({ status: 'connected', topic: session.topic, address, chains, chainId: chains.includes(1) ? 1 : chains[0] ?? 1, uri: null });
    } catch (e) {
      set({ status: 'error', uri: null, error: e instanceof Error ? e.message : 'Connexion échouée' });
    }
  },

  disconnect: async () => {
    const { topic } = get();
    if (client && topic) {
      await client.disconnect({ topic, reason: { code: 6000, message: 'Déconnexion utilisateur' } }).catch(() => {});
    }
    get().reset();
  },

  setChain: (evmChainId) => set({ chainId: evmChainId }),

  request: async (method, params) => {
    const { topic, chainId } = get();
    if (!client || !topic) throw new Error('Non connecté');
    // La requête part vers l'app Nova, qui affiche la demande + signe avec PIN/bio.
    return client.request<string>({
      topic,
      chainId: `eip155:${chainId}`,
      request: { method, params },
    });
  },

  reset: () => set({ status: 'idle', uri: null, topic: null, address: null, chains: [], chainId: 1, error: null }),
}));
