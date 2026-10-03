/**
 * TON Connect — PONT JS (« injected wallet »), pour le navigateur intégré.
 *
 * Les wallets TON (Tonkeeper, MyTonWallet…) injectent dans chaque page de leur
 * navigateur un objet `window.<clé>.tonconnect`. Le SDK TON Connect du site le
 * découvre en parcourant `window` (il lui faut `walletInfo` complet) et, voyant
 * `isWalletBrowser`, demande la connexion DIRECTEMENT au wallet — ni QR, ni
 * choix de wallet : c'est le « il te demande tout seul si tu veux te
 * connecter ». Spécification : ton-connect/bridge.md, section « JS bridge ».
 *
 * Tout passe par `postMessage` vers l'app, et rien n'est signé ici : la page
 * reçoit seulement ce que l'utilisateur a approuvé avec son code.
 */
import type { ConnectRequest, DappManifest } from './connectLink';

/** Clé sous laquelle Kalyx s'annonce (`window.kalyx`), déclarée dans la liste des wallets. */
export const KALYX_JS_BRIDGE_KEY = 'kalyx';

export const KALYX_WALLET_INFO = {
  name: 'Kalyx',
  app_name: 'kalyx',
  image: 'https://kalyxwallet.com/tonconnect-icon.png',
  about_url: 'https://kalyxwallet.com',
  tondns: 'kalyxwallet.ton',
  platforms: ['android'],
} as const;

export type TcJsMethod = 'connect' | 'restoreConnection' | 'send';

export interface TcJsCall {
  id: number;
  method: TcJsMethod;
  params: unknown[];
}

/** Message de la page destiné au pont TON (les autres vont au fournisseur EVM). */
/** `token` : jeton de page (voir `parseDappMessage`) — une iframe ne le connaît pas. */
export function parseTcJsMessage(raw: string, token: string): TcJsCall | null {
  try {
    const m = JSON.parse(raw) as { __kalyxTc?: unknown; id?: unknown; method?: unknown; params?: unknown; k?: unknown };
    if (m?.__kalyxTc !== 1 || typeof m.id !== 'number' || !token || m.k !== token) return null;
    if (m.method !== 'connect' && m.method !== 'restoreConnection' && m.method !== 'send') return null;
    return { id: m.id, method: m.method, params: Array.isArray(m.params) ? m.params : [] };
  } catch {
    return null;
  }
}

/** Demande de connexion bien formée : manifeste en https et `ton_addr` demandé. */
export function validConnectRequest(r: unknown): ConnectRequest | null {
  const req = r as ConnectRequest | null;
  if (typeof req?.manifestUrl !== 'string' || !/^https:\/\/[^\s]+$/.test(req.manifestUrl)) return null;
  if (!Array.isArray(req.items) || !req.items.some((i) => i?.name === 'ton_addr')) return null;
  return req;
}

/**
 * La PAGE ouverte appartient-elle au site que le manifeste déclare ? Même hôte,
 * ou sous-domaine de celui-ci. Le pont HTTP ne peut vérifier que le manifeste ;
 * ici on connaît la vraie page, et sans cette règle un site piégé publierait un
 * manifeste « url: https://app.ston.fi » pour obtenir une preuve `ton_proof`
 * valable chez STON.fi.
 */
export function pageMatchesManifest(pageHost: string, manifest: DappManifest): boolean {
  let declared: string;
  try {
    declared = new URL(manifest.url).host.toLowerCase();
  } catch {
    return false;
  }
  const page = pageHost.toLowerCase();
  return !!page && (page === declared || page.endsWith(`.${declared}`));
}

/** JS qui résout l'appel `id` de la page. */
export function tcResolveJs(id: number, payload: unknown): string {
  return `window.__kalyxTcResolve && window.__kalyxTcResolve(${id}, ${JSON.stringify(payload)}); true;`;
}

/** JS qui émet un événement du wallet vers la page (déconnexion…). */
export function tcEmitJs(event: unknown): string {
  return `window.__kalyxTcEmit && window.__kalyxTcEmit(${JSON.stringify(event)}); true;`;
}

/** Script injecté avant le chargement de chaque page. */
export function buildTonJsBridge(deviceInfo: unknown, token: string): string {
  return `(function () {
  if (window.${KALYX_JS_BRIDGE_KEY} && window.${KALYX_JS_BRIDGE_KEY}.tonconnect) return;
  var pending = {};
  var nextId = 1;
  var subs = [];
  function call(method, params) {
    return new Promise(function (resolve) {
      var id = nextId++;
      pending[id] = resolve;
      window.ReactNativeWebView.postMessage(JSON.stringify({ __kalyxTc: 1, id: id, method: method, params: params, k: ${JSON.stringify(token)} }));
    });
  }
  var tonconnect = {
    deviceInfo: ${JSON.stringify(deviceInfo)},
    walletInfo: ${JSON.stringify(KALYX_WALLET_INFO)},
    protocolVersion: 2,
    isWalletBrowser: true,
    connect: function (protocolVersion, message) { return call('connect', [protocolVersion, message]); },
    restoreConnection: function () { return call('restoreConnection', []); },
    send: function (message) { return call('send', [message]); },
    listen: function (callback) {
      subs.push(callback);
      return function () { subs = subs.filter(function (f) { return f !== callback; }); };
    },
  };
  window.__kalyxTcResolve = function (id, payload) {
    var p = pending[id];
    if (!p) return;
    delete pending[id];
    p(payload);
  };
  window.__kalyxTcEmit = function (event) {
    subs.slice().forEach(function (f) { try { f(event); } catch (e) {} });
  };
  var holder = window.${KALYX_JS_BRIDGE_KEY} || {};
  holder.tonconnect = tonconnect;
  window.${KALYX_JS_BRIDGE_KEY} = holder;
})();
true;`;
}
