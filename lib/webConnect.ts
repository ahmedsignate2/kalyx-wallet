/**
 * Connexion WalletConnect CÔTÉ dApp — pour le tableau de bord WEB.
 *
 * Modèle : le téléphone (app Nova) est le coffre-fort ; ce site est juste une
 * fenêtre. Le site NE stocke NI seed NI clé privée. Il ouvre une session
 * WalletConnect (QR), reçoit uniquement les adresses publiques, et FORWARDE
 * toute action sensible (envoi/signature) à l'app Nova qui signe avec PIN/bio.
 * Le web ne peut jamais signer seul.
 *
 * Utilise @walletconnect/sign-client (côté dApp), pas web3wallet (côté wallet,
 * lui c'est le mobile).
 */
import { create } from 'zustand';
import SignClient from '@walletconnect/sign-client';

const PROJECT_ID = process.env.EXPO_PUBLIC_WALLETCONNECT_ID || '';

type Status = 'idle' | 'connecting' | 'connected' | 'error';

interface Session {
  topic: string;
  address: string;
  chainId: number; // EVM chain id (eip155)
}

interface WebConnectState {
  status: Status;
  uri: string | null; // URI WalletConnect à afficher en QR
  session: Session | null;
  error: string | null;
  init: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  /** Forwarde une requête à signer vers l'app Nova. Renvoie le résultat (hash/sig). */
  request: (method: string, params: unknown[]) => Promise<string>;
  reset: () => void;
}

let client: InstanceType<typeof SignClient> | null = null;

/** Parse « eip155:1:0xabc… » → { chainId, address }. */
function parseAccount(acc: string): Session | null {
  const [ns, id, addr] = acc.split(':');
  if (ns !== 'eip155' || !id || !addr) return null;
  return { topic: '', chainId: Number(id), address: addr };
}

export const useWebConnect = create<WebConnectState>((set, get) => ({
  status: 'idle',
  uri: null,
  session: null,
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
      const acc = last.namespaces?.eip155?.accounts?.[0];
      const parsed = acc ? parseAccount(acc) : null;
      if (parsed) set({ status: 'connected', session: { ...parsed, topic: last.topic }, uri: null });
    }
    // Nettoyage si le téléphone se déconnecte.
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
      const { uri, approval } = await client.connect({
        requiredNamespaces: {
          eip155: {
            methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData', 'eth_signTypedData_v4'],
            chains: ['eip155:1'],
            events: ['chainChanged', 'accountsChanged'],
          },
        },
      });
      if (uri) set({ uri });
      const session = await approval(); // résolu quand le téléphone approuve
      const acc = session.namespaces?.eip155?.accounts?.[0];
      const parsed = acc ? parseAccount(acc) : null;
      if (!parsed) throw new Error('Aucune adresse reçue');
      set({ status: 'connected', session: { ...parsed, topic: session.topic }, uri: null });
    } catch (e) {
      set({ status: 'error', uri: null, error: e instanceof Error ? e.message : 'Connexion échouée' });
    }
  },

  disconnect: async () => {
    const { session } = get();
    if (client && session) {
      await client.disconnect({ topic: session.topic, reason: { code: 6000, message: 'Déconnexion utilisateur' } }).catch(() => {});
    }
    get().reset();
  },

  request: async (method, params) => {
    const { session } = get();
    if (!client || !session) throw new Error('Non connecté');
    // La requête part vers l'app Nova, qui affiche la demande + signe avec PIN/bio.
    const res = await client.request<string>({
      topic: session.topic,
      chainId: `eip155:${session.chainId}`,
      request: { method, params },
    });
    return res;
  },

  reset: () => set({ status: 'idle', uri: null, session: null, error: null }),
}));
