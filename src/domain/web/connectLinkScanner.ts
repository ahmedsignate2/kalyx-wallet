/**
 * QR DE CONNEXION AFFICHÉ PAR LA PAGE (navigateur intégré).
 *
 * Une dApp qui ne voit pas Kalyx directement ouvre sa fenêtre de connexion :
 * WalletConnect (AppKit, Web3Modal, WalletConnect Modal) ou TON Connect
 * (tonconnect-ui). Ces fenêtres portent le lien de connexion dans leurs
 * éléments (attribut `uri` du QR, liens vers les wallets). Kalyx le repère et
 * PROPOSE de se connecter, au lieu de laisser l'utilisateur devant un QR
 * qu'il ne peut pas scanner avec son propre téléphone.
 *
 * Ce script ne fait que LIRE : seulement dans ces fenêtres de connexion (pas
 * le reste de la page), page visible, une fois par lien, et le message porte
 * le jeton de la page (une iframe ne le connaît pas). Rien ne part sans
 * l'accord de l'utilisateur dans l'app, puis la fenêtre de connexion habituelle.
 */

/** Fenêtres de connexion connues (balises AppKit / Web3Modal / WalletConnect Modal, racine tonconnect-ui). */
export const CONNECT_MODAL_SELECTOR = 'w3m-modal,wcm-modal,appkit-modal,w3m-router,wui-qr-code,#tc-widget-root,tc-root';

/** Message de la page : un lien de connexion vu dans sa fenêtre de connexion. */
export function parseConnectLinkMessage(raw: string, token: string): string | null {
  try {
    const m = JSON.parse(raw) as { __kalyxLink?: unknown; link?: unknown; k?: unknown };
    if (m?.__kalyxLink !== 1 || !token || m.k !== token || typeof m.link !== 'string' || m.link.length > 8192) return null;
    return m.link;
  } catch {
    return null;
  }
}

/** Script injecté avant le chargement de chaque page. */
export function buildConnectLinkScanner(token: string): string {
  return `(function () {
  if (window.__kalyxLinkScan) return;
  window.__kalyxLinkScan = 1;
  var seen = {};
  var WC = /wc:[0-9a-f]{64}@2\\?[^\\s"'<>]*symKey=[0-9a-f]{64}[^\\s"'<>]*/i;
  var TC = /(?:tc:\\/\\/|https:\\/\\/)[^\\s"'<>]*[?&]v=2&id=[0-9a-f]{64}&r=[^\\s"'<>]+/i;
  var ATTRS = ['uri', 'href', 'value', 'data-uri', 'data-href'];
  function post(link) {
    if (seen[link]) return;
    seen[link] = 1;
    try { window.ReactNativeWebView.postMessage(JSON.stringify({ __kalyxLink: 1, link: link, k: ${JSON.stringify(token)} })); } catch (e) {}
  }
  function check(v) {
    if (!v || typeof v !== 'string' || v.length > 8192) return;
    var m = v.match(WC) || v.match(TC);
    if (m) post(m[0].replace(/&amp;/g, '&'));
  }
  function walk(root, depth) {
    var els = root.querySelectorAll('*');
    for (var i = 0; i < els.length && i < 4000; i++) {
      var el = els[i];
      for (var j = 0; j < ATTRS.length; j++) check(el.getAttribute && el.getAttribute(ATTRS[j]));
      if (el.shadowRoot && depth < 8) walk(el.shadowRoot, depth + 1);
    }
  }
  function scan() {
    if (document.hidden) return;
    try {
      var roots = document.querySelectorAll(${JSON.stringify(CONNECT_MODAL_SELECTOR)});
      for (var i = 0; i < roots.length; i++) {
        var r = roots[i];
        for (var j = 0; j < ATTRS.length; j++) check(r.getAttribute(ATTRS[j]));
        walk(r, 0);
        if (r.shadowRoot) walk(r.shadowRoot, 1);
      }
    } catch (e) {}
  }
  setInterval(scan, 1200);
})();
true;`;
}
