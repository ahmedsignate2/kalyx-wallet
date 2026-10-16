/**
 * Navigateur dApps — fournisseur SOLANA injecté (sans WalletConnect).
 *
 * Deux portes vers le même pont :
 * - Wallet Standard (`wallet-standard:register-wallet` / `app-ready`) : Kalyx
 *   apparaît directement dans la liste « Connect wallet » de Jupiter, Raydium,
 *   Magic Eden… (adaptateurs @solana/wallet-adapter, @wallet-standard).
 * - `window.solana` (API historique à la Phantom) pour les sites plus anciens.
 *
 * Chaque appel poste `{ id, method: 'sol_*', params, k }` (même jeton de page
 * que le fournisseur EVM) et attend `window.__kalyxResolve(id, …)`. Les
 * identifiants partent de 1e9 : jamais en collision avec ceux du fournisseur
 * EVM, dont la fonction de réponse est enveloppée, pas remplacée.
 *
 * Les octets voyagent en base64. La page ne voit JAMAIS de clé : connexion,
 * message et transaction passent par la fenêtre d'approbation native + PIN.
 */
import { base58, base64 } from '@scure/base';
import { KALYX_ICON_DATA_URI } from './kalyxIcon';

export const SOL_METHODS = new Set(['sol_connect', 'sol_disconnect', 'sol_signMessage', 'sol_signTransaction']);

export type SolTxMode = 'sign' | 'signAll' | 'signAndSend';

/** Réseau Kalyx d'une chaîne Wallet Standard (`solana:mainnet`, `solana:devnet`) ; absent = mainnet. */
export function solChainId(chain: unknown): 'solana' | 'solana-devnet' | null {
  if (chain == null || chain === '' || chain === 'solana:mainnet' || chain === 'solana:mainnet-beta') return 'solana';
  if (chain === 'solana:devnet') return 'solana-devnet';
  return null;
}

/**
 * Paramètres d'une demande de transaction(s) : `[base64[], mode, chain]`.
 * Nul si malformée — rien n'est alors montré ni signé.
 */
export function parseSolTxParams(params: unknown[]): { txs: string[]; mode: SolTxMode; chainId: 'solana' | 'solana-devnet' } | null {
  const [txs, mode, chain] = params;
  if (!Array.isArray(txs) || txs.length === 0 || txs.length > 20) return null;
  if (!txs.every((x) => typeof x === 'string' && x.length > 0 && x.length < 20_000 && /^[A-Za-z0-9+/]+={0,2}$/.test(x))) return null;
  if (mode !== 'sign' && mode !== 'signAll' && mode !== 'signAndSend') return null;
  if (mode !== 'signAll' && txs.length !== 1) return null;
  const chainId = solChainId(chain);
  if (!chainId) return null;
  return { txs: txs as string[], mode, chainId };
}

/** Message à signer (base64) → forme attendue par `signSolanaMessage` (base58 des octets). Nul si illisible. */
export function solMessageParam(params: unknown[]): string | null {
  const raw = params[0];
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 20_000) return null;
  try {
    const bytes = base64.decode(raw);
    return bytes.length ? base58.encode(bytes) : null;
  } catch {
    return null;
  }
}

/** Compte exposé à la page : adresse base58 + clé publique en base64 (32 octets). */
export function solAccountPayload(address: string): { address: string; publicKey: string } {
  return { address, publicKey: base64.encode(base58.decode(address)) };
}

/** Signature base58 (renvoyée par le portefeuille ou le réseau) → base64 pour la page. */
export function sigToBase64(sig: string): string {
  return base64.encode(base58.decode(sig));
}

/** JS d'événement côté Solana (`connect`, `disconnect`, `accountChanged`). */
export function solEmitJs(event: 'connect' | 'disconnect' | 'accountChanged', data: unknown): string {
  return `window.__kalyxSolEmit && window.__kalyxSolEmit(${JSON.stringify(event)}, ${JSON.stringify(data ?? null)}); true;`;
}

const ICON = KALYX_ICON_DATA_URI;

export function buildSolanaProvider(token: string): string {
  return `(function () {
  if (window.__kalyxSol) return;
  window.__kalyxSol = true;
  var K = ${JSON.stringify(token)};
  var CHAINS = ['solana:mainnet', 'solana:devnet'];
  var pending = {};
  var nextId = 1000000000;
  var account = null; /* { address, publicKey (Uint8Array) } */
  var changeListeners = [];
  var legacyListeners = {};

  function b64e(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }
  function b64d(str) {
    var s = atob(str), out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  function call(method, params) {
    return new Promise(function (resolve, reject) {
      var id = nextId++;
      pending[id] = { resolve: resolve, reject: reject };
      window.ReactNativeWebView.postMessage(JSON.stringify({ id: id, method: method, params: params || [], k: K }));
    });
  }
  var prevResolve = window.__kalyxResolve;
  window.__kalyxResolve = function (id, result, error) {
    var p = pending[id];
    if (!p) return prevResolve ? prevResolve(id, result, error) : undefined;
    delete pending[id];
    if (error) {
      var err = new Error(error.message || 'Refusé');
      err.code = error.code || 4001;
      p.reject(err);
    } else p.resolve(result);
  };

  function makeAccount(a) {
    return Object.freeze({
      address: a.address,
      publicKey: b64d(a.publicKey),
      chains: CHAINS.slice(),
      features: ['solana:signAndSendTransaction', 'solana:signTransaction', 'solana:signMessage'],
    });
  }
  function pubKeyObj(acc) {
    return {
      toString: function () { return acc.address; },
      toBase58: function () { return acc.address; },
      toJSON: function () { return acc.address; },
      toBytes: function () { return acc.publicKey.slice(); },
      equals: function (o) { return !!o && String(o.toBase58 ? o.toBase58() : o) === acc.address; },
    };
  }
  function setAccount(a) {
    var prev = account ? account.address : null;
    account = a ? makeAccount(a) : null;
    legacy.publicKey = account ? pubKeyObj(account) : null;
    legacy.isConnected = !!account;
    if ((account ? account.address : null) !== prev) {
      var accs = account ? [account] : [];
      changeListeners.slice().forEach(function (fn) { try { fn({ accounts: accs }); } catch (e) {} });
    }
  }
  function legacyEmit(ev, data) {
    (legacyListeners[ev] || []).slice().forEach(function (fn) { try { fn(data); } catch (e) {} });
  }
  window.__kalyxSolEmit = function (ev, data) {
    if (ev === 'disconnect') { if (account) { setAccount(null); legacyEmit('disconnect'); } return; }
    if (ev === 'connect' && data) { setAccount(data); legacyEmit('connect', legacy.publicKey); return; }
    if (ev === 'accountChanged') { setAccount(data || null); legacyEmit('accountChanged', legacy.publicKey); }
  };

  function connect(silent) {
    return call('sol_connect', [{ silent: !!silent }]).then(function (a) { setAccount(a); return account; });
  }
  function disconnect() {
    setAccount(null);
    return call('sol_disconnect', []).then(function () {}, function () {});
  }
  /* Octets d'une transaction web3.js (legacy ou v0), d'un Uint8Array ou d'un tableau. */
  function txBytes(tx) {
    if (tx instanceof Uint8Array) return tx;
    if (Array.isArray(tx)) return new Uint8Array(tx);
    if (tx && typeof tx.serialize === 'function') {
      return 'version' in tx ? tx.serialize() : tx.serialize({ requireAllSignatures: false, verifySignatures: false });
    }
    throw new Error('Transaction illisible');
  }
  function rebuild(orig, bytes) {
    var C = orig && orig.constructor;
    if (C && typeof C.deserialize === 'function') return C.deserialize(bytes);
    if (C && typeof C.from === 'function') return C.from(bytes);
    return bytes;
  }
  function signTx(list, mode, chain) {
    return call('sol_signTransaction', [list.map(function (b) { return b64e(b); }), mode, chain || 'solana:mainnet']);
  }

  /* ── Wallet Standard ── */
  var wallet = {
    version: '1.0.0',
    name: 'Kalyx',
    icon: ${JSON.stringify(ICON)},
    chains: CHAINS.slice(),
    get accounts() { return account ? [account] : []; },
    features: {
      'standard:connect': {
        version: '1.0.0',
        connect: function (input) {
          return connect(input && input.silent).then(function () { return { accounts: wallet.accounts }; });
        },
      },
      'standard:disconnect': { version: '1.0.0', disconnect: disconnect },
      'standard:events': {
        version: '1.0.0',
        on: function (ev, fn) {
          if (ev !== 'change') return function () {};
          changeListeners.push(fn);
          return function () { changeListeners = changeListeners.filter(function (f) { return f !== fn; }); };
        },
      },
      'solana:signMessage': {
        version: '1.0.0',
        signMessage: function () {
          var inputs = Array.prototype.slice.call(arguments);
          return inputs.reduce(function (acc, input) {
            return acc.then(function (out) {
              return call('sol_signMessage', [b64e(input.message)]).then(function (r) {
                out.push({ signedMessage: input.message, signature: b64d(r.signature), signatureType: 'ed25519' });
                return out;
              });
            });
          }, Promise.resolve([]));
        },
      },
      'solana:signTransaction': {
        version: '1.0.0',
        supportedTransactionVersions: ['legacy', 0],
        signTransaction: function () {
          var inputs = Array.prototype.slice.call(arguments);
          var mode = inputs.length > 1 ? 'signAll' : 'sign';
          return signTx(inputs.map(function (i) { return i.transaction; }), mode, inputs[0] && inputs[0].chain).then(function (r) {
            return r.map(function (s) { return { signedTransaction: b64d(s) }; });
          });
        },
      },
      'solana:signAndSendTransaction': {
        version: '1.0.0',
        supportedTransactionVersions: ['legacy', 0],
        signAndSendTransaction: function () {
          var inputs = Array.prototype.slice.call(arguments);
          return inputs.reduce(function (acc, input) {
            return acc.then(function (out) {
              return signTx([input.transaction], 'signAndSend', input.chain).then(function (r) {
                out.push({ signature: b64d(r[0]) });
                return out;
              });
            });
          }, Promise.resolve([]));
        },
      },
    },
  };
  function register(api) { try { api.register(wallet); } catch (e) {} }
  try {
    window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', { detail: register }));
  } catch (e) {}
  try {
    window.addEventListener('wallet-standard:app-ready', function (e) { if (e && e.detail) register(e.detail); });
  } catch (e) {}

  /* ── window.solana (API historique) ── */
  var legacy = {
    isKalyx: true,
    isConnected: false,
    publicKey: null,
    connect: function (opts) {
      return connect(opts && opts.onlyIfTrusted).then(function () { legacyEmit('connect', legacy.publicKey); return { publicKey: legacy.publicKey }; });
    },
    disconnect: function () { return disconnect().then(function () { legacyEmit('disconnect'); }); },
    signMessage: function (msg) {
      var bytes = typeof msg === 'string' ? new TextEncoder().encode(msg) : msg;
      return call('sol_signMessage', [b64e(bytes)]).then(function (r) {
        return { signature: b64d(r.signature), publicKey: legacy.publicKey };
      });
    },
    signTransaction: function (tx) {
      return signTx([txBytes(tx)], 'sign').then(function (r) { return rebuild(tx, b64d(r[0])); });
    },
    signAllTransactions: function (txs) {
      return signTx(txs.map(txBytes), txs.length > 1 ? 'signAll' : 'sign').then(function (r) {
        return r.map(function (s, i) { return rebuild(txs[i], b64d(s)); });
      });
    },
    signAndSendTransaction: function (tx) {
      return signTx([txBytes(tx)], 'signAndSend').then(function (r) {
        var sig = b64d(r[0]);
        return { signature: window.__kalyxB58 ? window.__kalyxB58(sig) : b64e(sig), publicKey: legacy.publicKey };
      });
    },
    request: function (args) {
      var m = args && args.method, p = (args && args.params) || {};
      if (m === 'connect') return legacy.connect(p);
      if (m === 'disconnect') return legacy.disconnect();
      if (m === 'signMessage') return legacy.signMessage(p.message);
      return Promise.reject(new Error('Méthode non prise en charge'));
    },
    on: function (ev, fn) { (legacyListeners[ev] = legacyListeners[ev] || []).push(fn); return legacy; },
    off: function (ev, fn) { legacyListeners[ev] = (legacyListeners[ev] || []).filter(function (f) { return f !== fn; }); return legacy; },
    removeListener: function (ev, fn) { return legacy.off(ev, fn); },
  };
  /* base58 pour signAndSendTransaction (l'API historique rend une chaîne base58). */
  window.__kalyxB58 = function (bytes) {
    var A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', d = [], s = '', i, j, c, n;
    for (i = 0; i < bytes.length; i++) {
      c = bytes[i];
      for (j = 0; j < d.length; j++) { n = d[j] * 256 + c; d[j] = n % 58; c = (n / 58) | 0; }
      while (c) { d.push(c % 58); c = (c / 58) | 0; }
    }
    for (i = 0; i < bytes.length && bytes[i] === 0; i++) s += '1';
    for (i = d.length - 1; i >= 0; i--) s += A[d[i]];
    return s;
  };
  if (!window.solana) {
    try { Object.defineProperty(window, 'solana', { value: legacy, configurable: true }); } catch (e) { window.solana = legacy; }
  }
  window.kalyx = window.kalyx || {};
  window.kalyx.solana = legacy;
})();
true;`;
}
