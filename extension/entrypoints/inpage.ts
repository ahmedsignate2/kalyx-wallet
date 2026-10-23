/**
 * SCRIPT DE PAGE (monde « MAIN ») — ce que voit une dApp.
 *
 *  - EVM : un fournisseur EIP-1193, annoncé par EIP-6963 (la dApp le trouve
 *    à côté de MetaMask, Rabby…, sans conflit). `window.ethereum` n'est pris
 *    que si l'utilisateur a choisi « Kalyx par défaut » dans les réglages.
 *  - Solana : un portefeuille Wallet Standard (Jupiter, Raydium, Magic Eden…).
 *
 * Ce script n'a AUCUN pouvoir : pas de clé, pas d'API d'extension. Il poste
 * chaque demande au relais (script isolé), qui la passe au service worker ;
 * c'est là que tout se décide, avec l'origine lue par Chrome.
 */
import { base58, base64 } from '@scure/base';
import { KALYX_ICON_DATA_URI } from '../../lib/kalyxIcon';

declare global {
  interface Window {
    __kalyxDefault__?: boolean;
    __kalyxInjected__?: boolean;
  }
}

type Listener = (data: unknown) => void;
interface ProviderError extends Error {
  code: number;
  data?: unknown;
}

export default defineUnlistedScript(() => {
  // Jamais dans un cadre : seule la page principale parle à Kalyx.
  if (window.top !== window) return;
  if (window.__kalyxInjected__) return;
  Object.defineProperty(window, '__kalyxInjected__', { value: true });
  const asDefault = window.__kalyxDefault__ === true;
  try {
    delete window.__kalyxDefault__;
  } catch {
    /* propriété non configurable : sans importance */
  }

  const ORIGIN = location.origin;
  /*
   * postMessage d'origine, pris au chargement (avant tout script de la page) :
   * un script qui le remplace ensuite ne voit pas passer nos demandes, et le
   * remplacement est lui-même un signe de page altérée.
   */
  const rawPost = window.postMessage;
  const post = rawPost.bind(window);
  /** Signes d'une page altérée, transmis à la première demande (jamais au chargement : aucune visite signalée). */
  const tampered = new Set<string>();
  let reported = 0;
  const pending = new Map<number, { method: string; resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
  let nextId = 1;

  function call(family: 'evm' | 'solana', method: string, params: unknown[] = []): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (window.postMessage !== rawPost) tampered.add('postMessageHooked');
      if (asDefault && (window as { ethereum?: unknown }).ethereum !== provider) tampered.add('ethereumReplaced');
      if (tampered.size > reported) {
        reported = tampered.size;
        post({ k: 'kalyx:req', id: nextId++, family: 'evm', method: 'kalyx_tamper', params: [...tampered] }, ORIGIN);
      }
      const id = nextId++;
      pending.set(id, { method, resolve, reject });
      post({ k: 'kalyx:req', id, family, method, params }, ORIGIN);
    });
  }

  const providerError = (e: { code?: number; message?: string; data?: unknown }): ProviderError => {
    const err = new Error(e?.message || 'Erreur Kalyx') as ProviderError;
    err.code = typeof e?.code === 'number' ? e.code : -32603;
    if (e?.data !== undefined) err.data = e.data;
    return err;
  };

  /* ── EVM : EIP-1193 ── */
  const listeners = new Map<string, Set<Listener>>();
  const emit = (ev: string, data: unknown) => listeners.get(ev)?.forEach((fn) => {
    try {
      fn(data);
    } catch {
      /* un écouteur de la page qui plante ne casse pas les autres */
    }
  });
  let connected = false;

  const provider = {
    isKalyx: true,
    // « Kalyx par défaut » : compatibilité avec les dApps qui ne cherchent que MetaMask.
    isMetaMask: asDefault,
    chainId: null as string | null,
    networkVersion: null as string | null,
    selectedAddress: null as string | null,
    isConnected: () => connected,
    request(args: { method?: unknown; params?: unknown }): Promise<unknown> {
      if (!args || typeof args.method !== 'string') return Promise.reject(providerError({ code: -32602, message: 'Requête invalide' }));
      const params = Array.isArray(args.params) ? args.params : args.params === undefined ? [] : [args.params];
      return call('evm', args.method, params);
    },
    on(ev: string, fn: Listener) {
      if (typeof fn === 'function') (listeners.get(ev) ?? listeners.set(ev, new Set()).get(ev)!).add(fn);
      return provider;
    },
    once(ev: string, fn: Listener) {
      const wrap: Listener = (d) => (provider.removeListener(ev, wrap), fn(d));
      return provider.on(ev, wrap);
    },
    removeListener(ev: string, fn: Listener) {
      listeners.get(ev)?.delete(fn);
      return provider;
    },
    off(ev: string, fn: Listener) {
      return provider.removeListener(ev, fn);
    },
    removeAllListeners(ev?: string) {
      if (ev) listeners.delete(ev);
      else listeners.clear();
      return provider;
    },
    /* API héritée, encore utilisée par de vieilles dApps */
    enable: () => provider.request({ method: 'eth_requestAccounts' }),
    send(m: unknown, p?: unknown) {
      return provider.request(typeof m === 'string' ? { method: m, params: p } : (m as { method: string; params?: unknown }));
    },
    sendAsync(payload: { id?: unknown; method: string; params?: unknown }, cb: (e: unknown, r?: unknown) => void) {
      provider.request(payload).then(
        (result) => cb(null, { id: payload.id, jsonrpc: '2.0', result }),
        (e) => cb(e),
      );
    },
  };

  function setChain(id: unknown) {
    if (typeof id !== 'string' || id === provider.chainId) return;
    provider.chainId = id;
    provider.networkVersion = String(Number.parseInt(id, 16));
    if (!connected) {
      connected = true;
      emit('connect', { chainId: id });
    } else emit('chainChanged', id);
  }
  function setAccounts(list: unknown) {
    const a = Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
    if ((a[0] ?? null) === provider.selectedAddress) return;
    provider.selectedAddress = a[0] ?? null;
    emit('accountsChanged', a);
  }

  /* ── Solana : Wallet Standard ── */
  type SolAccount = { address: string; publicKey: Uint8Array; chains: string[]; features: string[] };
  const SOL_CHAINS = ['solana:mainnet'];
  const SOL_FEATURES = ['solana:signAndSendTransaction', 'solana:signTransaction', 'solana:signMessage'];
  let solAccounts: SolAccount[] = [];
  const solListeners = new Set<(p: { accounts: SolAccount[] }) => void>();
  function setSolana(address: unknown) {
    const next = typeof address === 'string' && address ? [{ address, publicKey: base58.decode(address), chains: SOL_CHAINS, features: SOL_FEATURES }] : [];
    if ((next[0]?.address ?? null) === (solAccounts[0]?.address ?? null)) return;
    solAccounts = next;
    solListeners.forEach((fn) => {
      try {
        fn({ accounts: solAccounts });
      } catch {
        /* idem */
      }
    });
  }
  const b64 = (u: Uint8Array) => base64.encode(u);
  const signWith = (method: string) => async (...inputs: { transaction?: Uint8Array; message?: Uint8Array; chain?: string; options?: unknown }[]) => {
    const r = (await call('solana', method, inputs.map((i) => ({ transaction: i.transaction && b64(i.transaction), message: i.message && b64(i.message), chain: i.chain, options: i.options })))) as {
      signedTransaction?: string;
      signature?: string;
      signedMessage?: string;
    }[];
    return r.map((x) => ({
      ...(x.signedTransaction ? { signedTransaction: base64.decode(x.signedTransaction) } : {}),
      ...(x.signedMessage ? { signedMessage: base64.decode(x.signedMessage) } : {}),
      ...(x.signature ? { signature: base64.decode(x.signature) } : {}),
    }));
  };

  const solWallet = {
    version: '1.0.0' as const,
    name: 'Kalyx',
    icon: KALYX_ICON_DATA_URI as `data:image/svg+xml;base64,${string}`,
    chains: SOL_CHAINS,
    get accounts() {
      return solAccounts.slice();
    },
    features: {
      'standard:connect': {
        version: '1.0.0',
        connect: async (input?: { silent?: boolean }) => {
          const r = (await call('solana', 'sol_connect', [{ silent: input?.silent === true }])) as { address: string | null };
          setSolana(r?.address);
          return { accounts: solAccounts.slice() };
        },
      },
      'standard:disconnect': {
        version: '1.0.0',
        disconnect: async () => {
          await call('solana', 'sol_disconnect');
          setSolana(null);
        },
      },
      'standard:events': {
        version: '1.0.0',
        on: (event: string, listener: (p: { accounts: SolAccount[] }) => void) => {
          if (event !== 'change') return () => {};
          solListeners.add(listener);
          return () => solListeners.delete(listener);
        },
      },
      'solana:signTransaction': { version: '1.0.0', supportedTransactionVersions: ['legacy', 0], signTransaction: signWith('sol_signTransaction') },
      'solana:signAndSendTransaction': { version: '1.0.0', supportedTransactionVersions: ['legacy', 0], signAndSendTransaction: signWith('sol_signAndSendTransaction') },
      'solana:signMessage': { version: '1.0.0', signMessage: signWith('sol_signMessage') },
    },
  };

  /* ── Réponses et événements du relais ── */
  window.addEventListener('message', (e: MessageEvent) => {
    if (e.source !== window || e.origin !== ORIGIN) return;
    const d = e.data as { k?: string; id?: number; result?: unknown; error?: { code?: number; message?: string; data?: unknown }; event?: string; data?: unknown };
    if (d?.k === 'kalyx:res' && typeof d.id === 'number') {
      const p = pending.get(d.id);
      if (!p) return;
      pending.delete(d.id);
      if (d.error) return p.reject(providerError(d.error));
      // Les réponses qui disent l'état tiennent à jour les champs hérités (chainId, selectedAddress).
      if (p.method === 'eth_chainId') setChain(d.result);
      else if (p.method === 'eth_accounts' || p.method === 'eth_requestAccounts') setAccounts(d.result);
      p.resolve(d.result);
    } else if (d?.k === 'kalyx:evt') {
      if (d.event === 'hello') {
        const h = d.data as { chainId?: string; evm?: string | null; solana?: string | null };
        setChain(h?.chainId);
        setAccounts(h?.evm ? [h.evm] : []);
        setSolana(h?.solana);
      } else if (d.event === 'chainChanged') setChain(d.data);
      else if (d.event === 'accountsChanged') setAccounts(d.data);
      else if (d.event === 'solanaAccountsChanged') setSolana(Array.isArray(d.data) ? d.data[0] : null);
      else if (d.event === 'relayRestarted') {
        // Le service worker a redémarré : les demandes en vol n'auront pas de réponse.
        for (const [id, p] of pending) (pending.delete(id), p.reject(providerError({ code: 4900, message: 'Kalyx a redémarré : réessaie' })));
      }
    }
  });

  /* ── Annonces ── */
  const info = Object.freeze({ uuid: crypto.randomUUID(), name: 'Kalyx', icon: KALYX_ICON_DATA_URI, rdns: 'com.kalyxwallet' });
  const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: Object.freeze({ info, provider }) }));
  window.addEventListener('eip6963:requestProvider', announce);
  // Un AUTRE fournisseur qui s'annonce comme Kalyx : une extension ou la page se fait passer pour nous.
  window.addEventListener('eip6963:announceProvider', (e: Event) => {
    const d = (e as CustomEvent).detail as { info?: { rdns?: unknown }; provider?: unknown } | undefined;
    if (d?.info?.rdns === 'com.kalyxwallet' && d.provider !== provider) tampered.add('rdnsSpoof');
  });
  announce();

  // Wallet Standard : s'enregistre auprès de l'application, qu'elle soit déjà prête ou non.
  const registerSol = (api: { register: (w: unknown) => unknown }) => api.register(solWallet);
  try {
    window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', { detail: registerSol }));
  } catch {
    /* page sans CustomEvent : rien à faire */
  }
  window.addEventListener('wallet-standard:app-ready', (e: Event) => registerSol((e as CustomEvent).detail));

  if (asDefault) {
    try {
      Object.defineProperty(window, 'ethereum', { value: provider, configurable: true, writable: true });
    } catch {
      /* déjà verrouillé par un autre portefeuille : l'annonce EIP-6963 suffit */
    }
  }

  /*
   * Rien n'est demandé à Kalyx au chargement : le relais ne se branche qu'à la
   * première demande de la page. Un site qui n'utilise pas de portefeuille ne
   * réveille jamais l'extension et ne lui apprend même pas qu'il a été visité.
   */
});
