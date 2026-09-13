/**
 * Navigateur dApps — côté « pont » :
 * - buildInjectedProvider() : le JS injecté dans la WebView qui expose
 *   window.ethereum (EIP-1193 + annonce EIP-6963 + API legacy enable/send).
 *   Chaque request() poste {id, method, params} à React Native et attend
 *   window.__kalyxResolve(id, result, error) en retour.
 * - READONLY_METHODS : méthodes JSON-RPC relayées telles quelles au RPC du
 *   réseau actif (aucune donnée sensible, aucune signature).
 * - rpcProxy() : POST JSON-RPC avec bascule sur les RPC de secours.
 *
 * SÉCURITÉ : la WebView ne voit JAMAIS de clé. Toute signature passe par une
 * fenêtre d'approbation native + PIN (mêmes primitives que WalletConnect).
 */

/** Méthodes lecture seule relayées au RPC (liste blanche stricte). */
export const READONLY_METHODS = new Set([
  'eth_call',
  'eth_estimateGas',
  'eth_gasPrice',
  'eth_maxPriorityFeePerGas',
  'eth_feeHistory',
  'eth_blockNumber',
  'eth_getBalance',
  'eth_getTransactionCount',
  'eth_getTransactionByHash',
  'eth_getTransactionReceipt',
  'eth_getBlockByNumber',
  'eth_getBlockByHash',
  'eth_getCode',
  'eth_getLogs',
  'eth_getStorageAt',
  'web3_clientVersion',
  'eth_syncing',
]);

/** POST JSON-RPC vers le premier RPC qui répond (fallbacks). */
export async function rpcProxy(rpcUrls: string[], method: string, params: unknown[]): Promise<unknown> {
  let lastError: unknown = new Error('Aucun RPC disponible');
  for (const url of rpcUrls) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      const json = (await res.json()) as { result?: unknown; error?: { message?: string; code?: number } };
      if (json.error) throw Object.assign(new Error(json.error.message ?? 'Erreur RPC'), { code: json.error.code });
      return json.result;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

/** Requête entrante de la dApp (postMessage → RN). */
export interface DappRequest {
  id: number;
  method: string;
  params: unknown[];
}

export function parseDappMessage(raw: string): DappRequest | null {
  try {
    const m = JSON.parse(raw) as Partial<DappRequest>;
    if (typeof m?.id !== 'number' || typeof m?.method !== 'string') return null;
    return { id: m.id, method: m.method, params: Array.isArray(m.params) ? m.params : [] };
  } catch {
    return null;
  }
}

/** JS de réponse à injecter dans la WebView (résout la promesse côté dApp). */
export function respondJs(id: number, result: unknown, error?: { code: number; message: string }): string {
  return `window.__kalyxResolve(${id}, ${error ? 'null' : JSON.stringify(result ?? null)}, ${
    error ? JSON.stringify(error) : 'null'
  }); true;`;
}

/** JS d'événement provider (accountsChanged, chainChanged, connect…). */
export function emitJs(event: string, data: unknown): string {
  return `window.__kalyxEmit && window.__kalyxEmit(${JSON.stringify(event)}, ${JSON.stringify(data)}); true;`;
}

/**
 * Provider injecté avant le chargement de la page.
 * `chainIdHex` = réseau actif au moment du chargement (mis à jour ensuite via
 * l'événement chainChanged).
 */
export function buildInjectedProvider(chainIdHex: string): string {
  return `(function () {
  if (window.ethereum && window.ethereum.isKalyx) return;
  var pending = {};
  var nextId = 1;
  var listeners = {};
  function emit(ev, data) {
    (listeners[ev] || []).slice().forEach(function (fn) { try { fn(data); } catch (e) {} });
  }
  var provider = {
    isKalyx: true,
    isMetaMask: true, /* compat : la plupart des dApps ne testent que ça */
    chainId: ${JSON.stringify(chainIdHex)},
    networkVersion: String(parseInt(${JSON.stringify(chainIdHex)}, 16)),
    selectedAddress: null,
    isConnected: function () { return true; },
    request: function (args) {
      if (!args || typeof args.method !== 'string') {
        return Promise.reject(new Error('Requête invalide'));
      }
      return new Promise(function (resolve, reject) {
        var id = nextId++;
        pending[id] = { resolve: resolve, reject: reject };
        window.ReactNativeWebView.postMessage(
          JSON.stringify({ id: id, method: args.method, params: args.params || [] })
        );
      });
    },
    on: function (ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); return provider; },
    once: function (ev, fn) {
      var wrap = function (d) { provider.removeListener(ev, wrap); fn(d); };
      return provider.on(ev, wrap);
    },
    removeListener: function (ev, fn) {
      listeners[ev] = (listeners[ev] || []).filter(function (f) { return f !== fn; });
      return provider;
    },
    removeAllListeners: function (ev) { if (ev) delete listeners[ev]; else listeners = {}; return provider; },
    /* API legacy encore utilisée par de vieilles dApps */
    enable: function () { return provider.request({ method: 'eth_requestAccounts' }); },
    send: function (m, p) {
      return provider.request(typeof m === 'string' ? { method: m, params: p } : m);
    },
    sendAsync: function (payload, cb) {
      provider.request(payload).then(
        function (r) { cb(null, { id: payload.id, jsonrpc: '2.0', result: r }); },
        function (e) { cb(e); }
      );
    },
  };
  window.__kalyxResolve = function (id, result, error) {
    var p = pending[id];
    if (!p) return;
    delete pending[id];
    if (error) {
      var err = new Error(error.message || 'Refusé par l\\'utilisateur');
      err.code = error.code || 4001;
      p.reject(err);
    } else {
      if (typeof result === 'string' || Array.isArray(result)) {
        /* garde selectedAddress/chainId en phase pour les dApps legacy */
        if (Array.isArray(result) && typeof result[0] === 'string' && result[0].slice(0, 2) === '0x' && result[0].length === 42) {
          provider.selectedAddress = result[0];
        }
      }
      p.resolve(result);
    }
  };
  window.__kalyxEmit = function (ev, data) {
    if (ev === 'chainChanged' && typeof data === 'string') {
      provider.chainId = data;
      provider.networkVersion = String(parseInt(data, 16));
    }
    if (ev === 'accountsChanged' && Array.isArray(data)) {
      provider.selectedAddress = data[0] || null;
    }
    emit(ev, data);
  };
  window.ethereum = provider;
  /* EIP-6963 : annonce multi-provider moderne */
  var info = {
    uuid: 'e9f8c2a4-ka1x-0000-0000-000000000001',
    name: 'Kalyx Wallet',
    icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+PHJlY3Qgd2lkdGg9IjMyIiBoZWlnaHQ9IjMyIiByeD0iOCIgZmlsbD0iIzdDNUNGRiIvPjx0ZXh0IHg9IjE2IiB5PSIyMiIgZm9udC1zaXplPSIxNiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iI2ZmZiI+TjwvdGV4dD48L3N2Zz4=',
    rdns: 'wallet.kalyx',
  };
  function announce() {
    try {
      window.dispatchEvent(
        new CustomEvent('eip6963:announceProvider', {
          detail: Object.freeze({ info: info, provider: provider }),
        })
      );
    } catch (e) {}
  }
  window.addEventListener('eip6963:requestProvider', announce);
  announce();
})();
true;`;
}
