/**
 * Connexion WalletConnect CÔTÉ dApp — tableau de bord WEB.
 *
 * Le téléphone (app Nova) est le coffre-fort ; ce site est une fenêtre. Aucun
 * secret ici : session WalletConnect (QR), on reçoit seulement les adresses
 * publiques, et toute action sensible est FORWARDÉE à l'app Nova qui signe
 * (PIN/biométrie). Le web ne signe jamais seul.
 *
 * Multi-chaîne réel : EVM (eip155), Solana (solana) et Bitcoin (bip122). On
 * indexe tout sur l'ID de chaîne Nova (string), pas sur le chainId EVM.
 */
import { create } from 'zustand';
import SignClient from '@walletconnect/sign-client';
import { listChains } from '../src';

const PROJECT_ID = process.env.EXPO_PUBLIC_WALLETCONNECT_ID || '';

// Session du tableau de bord : déconnexion auto après 30 min d'inactivité.
const SESSION_TTL = 30 * 60 * 1000;

// CAIP-2 des réseaux non-EVM (mêmes valeurs que côté wallet mobile).
const SOLANA_CAIP = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const BTC_CAIP = 'bip122:000000000019d6689c085ae165831e93';

type Status = 'idle' | 'connecting' | 'connected' | 'error';

/** Un compte connecté = une chaîne Nova + son adresse publique. */
export interface ConnAccount {
  chainId: string; // ID de chaîne Nova (ex. 'ethereum', 'solana', 'bitcoin')
  address: string;
}

/** Demande de signature en cours, pilotant le popup « ouvrez Nova ». */
export interface PendingSign {
  label: string; // ex. « Transaction à signer »
  phase: 'await' | 'ok' | 'err';
  detail?: string;
}

/** Libellé lisible d'une méthode WalletConnect (pour le popup de signature). */
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

interface WebConnectState {
  status: Status;
  uri: string | null;
  topic: string | null;
  accounts: ConnAccount[]; // toutes les chaînes approuvées par le wallet
  selected: string | null; // ID de chaîne Nova sélectionné
  error: string | null;
  /** Métadonnées du portefeuille appairé (l'app Nova mobile), pour le panneau Sécurité. */
  peerName: string | null;
  peerUrl: string | null;
  /** Horodatage (ms) de l'établissement de la session courante. */
  connectedAt: number | null;
  /** Compteur de révision : incrémenté à chaque event WC (ou envoi). Les panneaux
   *  du dashboard le mettent dans leurs deps → rafraîchissement automatique. */
  rev: number;
  /** Horodatage de la dernière activité (pour l'expiration de session). */
  lastActivity: number;
  /** Signature en cours → pilote le popup « ouvrez Nova ». null = aucun popup. */
  pending: PendingSign | null;
  dismissPending: () => void;
  init: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  setChain: (novaChainId: string) => void;
  request: (method: string, params: unknown[]) => Promise<string>;
  /** Force un rafraîchissement des panneaux (bouton manuel). */
  refresh: () => void;
  reset: () => void;
}

let client: InstanceType<typeof SignClient> | null = null;

// Le sign-client WalletConnect (pino) crache en console.error des logs internes
// BÉNINS, surtout à chaque reconnexion du relais : restauration des souscriptions
// et réponses tardives sans listener. Sur web (dev server + LogBox) ça inonde la
// console / l'overlay rouge. On les filtre une seule fois, sans masquer les vraies
// erreurs. Miroir de silenceBenignWcLogs() côté mobile (walletconnect.ts).
const BENIGN_WEB_WC_LOGS = [
  '"context":"core/relayer',      // souscriptions / publisher / reconnexion du relais
  'Restore will override',         // ré-abonnement après reconnexion
  'subscription:',                 // dump des souscriptions restaurées
  'emitting session_request',      // réponse tardive après timeout/reconnexion…
  'without any listeners',         // …plus aucun listener : sans conséquence
  'Failed to decode message',      // message chiffré d'une session déjà supprimée
];
let webLogsFiltered = false;
function silenceBenignWebLogs() {
  if (webLogsFiltered) return;
  webLogsFiltered = true;
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
    return BENIGN_WEB_WC_LOGS.some((p) => joined.includes(p));
  };
  for (const level of ['warn', 'error', 'log'] as const) {
    const orig = console[level].bind(console);
    console[level] = (...args: unknown[]) => (isBenign(args) ? undefined : orig(...args));
  }
}

function evmCaips(): string[] {
  return listChains().filter((c) => c.family === 'evm' && c.evmChainId).map((c) => `eip155:${c.evmChainId}`);
}

/** account WC (« eip155:1:0x… », « solana:…:… », « bip122:…:… ») → chaîne Nova. */
function wcToNova(acc: string): ConnAccount | null {
  const p = acc.split(':');
  const ns = p[0];
  const addr = p[p.length - 1];
  if (!addr) return null;
  const all = listChains();
  if (ns === 'eip155') {
    const c = all.find((x) => x.family === 'evm' && x.evmChainId === Number(p[1]));
    return c ? { chainId: c.id, address: addr } : null;
  }
  if (ns === 'solana') {
    const c = all.find((x) => x.family === 'solana');
    return c ? { chainId: c.id, address: addr } : null;
  }
  if (ns === 'bip122') {
    const c = all.find((x) => x.family === 'bitcoin');
    return c ? { chainId: c.id, address: addr } : null;
  }
  return null;
}

/** Rassemble les comptes de TOUS les namespaces d'une session. */
function collect(namespaces: Record<string, { accounts?: string[] }> | undefined): ConnAccount[] {
  const out: ConnAccount[] = [];
  const seen = new Set<string>();
  for (const ns of Object.values(namespaces ?? {})) {
    for (const acc of ns.accounts ?? []) {
      const m = wcToNova(acc);
      if (m && !seen.has(m.chainId)) {
        seen.add(m.chainId);
        out.push(m);
      }
    }
  }
  return out;
}

/** ID de chaîne Nova → CAIP WalletConnect (pour forwarder une requête). */
function novaToCaip(novaChainId: string): string {
  const c = listChains().find((x) => x.id === novaChainId);
  if (c?.family === 'solana') return SOLANA_CAIP;
  if (c?.family === 'bitcoin') return BTC_CAIP;
  return `eip155:${c?.evmChainId ?? 1}`;
}

export const useWebConnect = create<WebConnectState>((set, get) => ({
  status: 'idle',
  uri: null,
  topic: null,
  accounts: [],
  selected: null,
  error: null,
  peerName: null,
  peerUrl: null,
  connectedAt: null,
  rev: 0,
  lastActivity: Date.now(),
  pending: null,
  dismissPending: () => set({ pending: null }),

  init: async () => {
    silenceBenignWebLogs();
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
    const sessions = client.session.getAll();
    const last = sessions[sessions.length - 1];
    if (last) {
      const accounts = collect(last.namespaces as Record<string, { accounts?: string[] }>);
      if (accounts.length) {
        const meta = (last.peer as { metadata?: { name?: string; url?: string } } | undefined)?.metadata;
        set({
          status: 'connected', topic: last.topic, accounts, selected: accounts[0].chainId, uri: null,
          peerName: meta?.name ?? null, peerUrl: meta?.url ?? null, connectedAt: last.expiry ? last.expiry * 1000 - 7 * 24 * 3600 * 1000 : Date.now(),
        });
      }
    }

    // Sync instantanée : réagit aux events du téléphone sans rafraîchir la page.
    const syncFromSession = () => {
      const { topic } = get();
      if (!client || !topic) return;
      try {
        const s = client.session.get(topic);
        const accounts = collect(s.namespaces as Record<string, { accounts?: string[] }>);
        if (accounts.length) {
          const sel = get().selected;
          set({ accounts, selected: sel && accounts.some((a) => a.chainId === sel) ? sel : accounts[0].chainId });
        }
      } catch {
        /* session absente : ignore */
      }
      set({ rev: get().rev + 1, lastActivity: Date.now() });
    };
    client.on('session_event', syncFromSession); // chainChanged / accountsChanged
    client.on('session_update', syncFromSession);
    client.on('session_delete', () => get().reset());
    // Le téléphone a coupé la session, ou elle a expiré côté relay : on nettoie
    // pour ne pas rester « connecté » sur une session morte (source du désync).
    client.on('session_expire', () => get().reset());

    // Expiration de session : déconnexion auto après 30 min sans activité.
    setInterval(() => {
      const { status, lastActivity } = get();
      if (status === 'connected' && Date.now() - lastActivity > SESSION_TTL) {
        void get().disconnect().finally(() => set({ error: 'Session expirée pour inactivité. Reconnecte-toi.' }));
      }
    }, 30_000);
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
      const evmMethods = ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData', 'eth_signTypedData_v4'];
      const evmEvents = ['chainChanged', 'accountsChanged'];
      const { uri, approval } = await client.connect({
        // Obligatoire : seulement la présence d'Ethereum, AUCUNE méthode requise —
        // ainsi l'utilisateur peut décocher des autorisations côté app (le wallet
        // approuve un sous-ensemble de méthodes sans que la session soit rejetée).
        requiredNamespaces: { eip155: { methods: [], chains: ['eip155:1'], events: [] } },
        optionalNamespaces: {
          eip155: { methods: evmMethods, chains: evmCaips(), events: evmEvents },
          solana: { methods: ['solana_getAccounts', 'solana_signTransaction', 'solana_signAllTransactions', 'solana_signMessage'], chains: [SOLANA_CAIP], events: ['accountsChanged'] },
          bip122: { methods: ['getAccountAddresses', 'getAccounts', 'signPsbt', 'signMessage', 'sendTransfer', 'sendTransaction'], chains: [BTC_CAIP], events: [] },
        },
      });
      if (uri) set({ uri });
      const session = await approval();
      const accounts = collect(session.namespaces as Record<string, { accounts?: string[] }>);
      if (!accounts.length) throw new Error('Aucune adresse reçue');
      const meta = (session.peer as { metadata?: { name?: string; url?: string } } | undefined)?.metadata;
      set({
        status: 'connected', topic: session.topic, accounts, selected: accounts[0].chainId, uri: null, lastActivity: Date.now(),
        peerName: meta?.name ?? null, peerUrl: meta?.url ?? null, connectedAt: Date.now(),
      });
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

  setChain: (novaChainId) => set({ selected: novaChainId, lastActivity: Date.now() }),

  request: async (method, params) => {
    const { topic, selected } = get();
    if (!client || !topic || !selected) throw new Error('Non connecté');
    // Garde-fou anti-« session zombie » : si le téléphone a laissé tomber la
    // session (verrouillage ancien, relance de l'app…), le web pouvait rester
    // « connecté » et la requête partait dans le vide. On vérifie d'abord que la
    // session existe encore ; sinon on se réinitialise et on le dit clairement.
    try {
      client.session.get(topic);
    } catch {
      get().reset();
      throw new Error('Session introuvable côté téléphone. Reconnecte le tableau de bord (QR).');
    }
    // Popup « Signature requise — ouvrez Nova » tant que le téléphone n'a pas répondu.
    const label = METHOD_LABELS[method] ?? 'Signature demandée';
    set({ pending: { label, phase: 'await' } });
    // La requête part vers l'app Nova, qui affiche la demande + signe avec PIN/bio.
    // Timeout de courtoisie : si l'app ne répond pas (fermée / verrouillée / hors
    // ligne), on rend la main avec un message utile au lieu de rester figé.
    const REQ_TIMEOUT = 120_000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("Le téléphone n'a pas répondu. Ouvre l'app Nova, déverrouille-la et réessaie.")),
        REQ_TIMEOUT,
      );
    });
    try {
      const res = await Promise.race([
        client.request<string>({ topic, chainId: novaToCaip(selected), request: { method, params } }),
        timeout,
      ]);
      // Signé sur le téléphone : succès auto-fermant + retour au tableau de bord à jour.
      set({ pending: { label, phase: 'ok', detail: 'Validé sur votre téléphone' }, rev: get().rev + 1, lastActivity: Date.now() });
      setTimeout(() => set({ rev: get().rev + 1 }), 4000); // 2e passe (inclusion bloc)
      setTimeout(() => { if (get().pending?.phase === 'ok') set({ pending: null }); }, 2500);
      return res;
    } catch (e) {
      // La session a pu disparaître pendant l'attente : on vérifie et on nettoie.
      try {
        if (topic) client?.session.get(topic);
      } catch {
        get().reset();
      }
      set({ pending: { label, phase: 'err', detail: e instanceof Error ? e.message : 'Refusé ou échoué' } });
      throw e;
    } finally {
      if (timer) clearTimeout(timer);
    }
  },

  refresh: () => set({ rev: get().rev + 1, lastActivity: Date.now() }),

  reset: () => set({ status: 'idle', uri: null, topic: null, accounts: [], selected: null, error: null, peerName: null, peerUrl: null, connectedAt: null, pending: null }),
}));
