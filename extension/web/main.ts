/**
 * WEBAPP (app.kalyxwallet.com) : l'interface de l'extension, en mode compagnon.
 *
 * Le téléphone garde les clés ; la page reçoit les adresses publiques de tous
 * ses portefeuilles (liaison WalletConnect par QR) et transmet chaque envoi,
 * swap ou révocation à l'app Kalyx, qui les fait valider.
 * Pas de mot de passe : 30 min sans activité, la liaison se ferme et la page
 * oublie tout.
 */
import '../lib/bufferGlobal';
import { setMessageHandler } from './shim';
import { makeWebHost } from './host';
import { installFeedback } from '../ui/feedback';
import { landscape, mountScene } from '../ui/landscape';
import { applyLang, errorText, t } from '../ui/i18n';
import { mountWallet } from '../ui/wallet';
import { h, send } from '../ui/dom';
import { glyph } from '../ui/glyph';
import { qrSvg } from '../ui/qr';

const host = makeWebHost();
setMessageHandler(host.handle);

applyLang();
installFeedback();
mountScene();
const app = document.getElementById('app')!;

/* ── Inactivité : 30 min sans geste, on se déconnecte (rien ne reste dans le navigateur). ── */
const IDLE_MS = 30 * 60_000;
const ACTIVE_ITEM = 'kalyx.web.lastActive';
const IDLE_FLAG = 'kalyx.web.idleOut';
const stamp = () => {
  try {
    localStorage.setItem(ACTIVE_ITEM, String(Date.now()));
  } catch {
    /* stockage bloqué */
  }
};
const lastActive = () => {
  try {
    return Number(localStorage.getItem(ACTIVE_ITEM) ?? 0);
  } catch {
    return 0;
  }
};
let lastStamp = 0;
for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) {
  addEventListener(ev, () => {
    // Une écriture par minute au plus.
    if (Date.now() - lastStamp > 60_000) (lastStamp = Date.now()), stamp();
  }, { passive: true });
}

async function signOut(idle = false) {
  await host.reset();
  try {
    // Sinon, la vieille date d'activité relançait la déconnexion à chaque chargement (boucle).
    localStorage.removeItem(ACTIVE_ITEM);
    localStorage.removeItem(HB_ITEM);
    if (idle) sessionStorage.setItem(IDLE_FLAG, '1');
  } catch {
    /* rien */
  }
  location.reload();
}

/* ── Signe de vie au téléphone : à l'ouverture, puis toutes les 3 h tant que la page est ouverte. ── */
const HB_ITEM = 'kalyx.web.heartbeatAt';
async function heartbeat() {
  try {
    if (Date.now() - Number(localStorage.getItem(HB_ITEM) ?? 0) < 30 * 60_000) return;
    localStorage.setItem(HB_ITEM, String(Date.now()));
    await host.heartbeat();
  } catch {
    /* relais injoignable : prochain essai plus tard */
  }
}

const wallet = mountWallet(app, {
  mode: 'web',
  onNoVault: () => linkScreen(),
  onLocked: () => void host.ready().then(() => wallet.load()),
  onLinkPhone: () => linkScreen(true),
  onSignOut: () => void signOut(),
});

/** Le ciel de l'accueil, le logo, puis la feuille : comme l'écran d'accès de l'extension. */
function frame(...children: (Node | false)[]) {
  app.replaceChildren(
    h(
      'div',
      { class: 'home access web-access enter' },
      h('section', { class: 'hero on-sky access-hero' }, landscape({ veil: true, glow: 0.4 }), h('span', { class: 'access-logo' }, h('img', { src: '/icon/128.png', alt: '' })), h('h1', {}, 'Kalyx Wallet')),
      h('section', { class: 'sheet access-sheet' }, ...children.filter((c): c is Node => !!c)),
    ),
  );
}

interface Candidate {
  topic: string;
  wallets: { key: string; label: string; accounts: { index: number; label: string; evm?: string; solana?: string; bitcoin?: string }[] }[];
  peer: { name: string; url: string };
}
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Relier le téléphone : QR, attente, puis « c'est bien ton téléphone ? » avant d'enregistrer quoi que ce soit. */
async function linkScreen(more = false) {
  const err = h('p', { class: 'error', role: 'alert' });
  let idle = false;
  try {
    idle = sessionStorage.getItem(IDLE_FLAG) === '1';
    sessionStorage.removeItem(IDLE_FLAG);
  } catch {
    /* rien */
  }
  const av = await send<{ available: boolean }>({ type: 'companion:available' });
  if (!av.ok || !av.available) return frame(h('p', { class: 'muted' }, t('compUnavailable')));
  const box = h('div', { class: 'qr skel web-qr', style: 'width:224px;height:224px' });
  const wait = h('p', { class: 'pill quiet status comp-wait', role: 'status' }, h('img', { class: 'spin-logo', src: '/icon/32.png', alt: '' }), t('compWaiting'));
  const retry = h('button', { class: 'btn secondary', type: 'button', hidden: true, on: { click: () => void linkScreen(more) } }, t('retry'));
  const point = (icon: string, text: string) => h('li', {}, h('span', { class: 'ob-v-ico' }, glyph(icon, 18)), h('span', {}, text));
  /*
   * Sur un téléphone, on ne scanne pas son propre écran : « Ouvrir dans l'app
   * Kalyx » (lien kalyx://wc) en premier, le QR replié pour un autre appareil.
   * Partout : copier le lien, à coller dans l'app (WalletConnect → Coller).
   */
  const onPhone = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
  const steps = h('p', { class: 'small muted' }, t('compSteps'));
  const qrWrap = h('div', { class: 'web-link', hidden: onPhone }, box, steps);
  const options = h('div', { class: 'stack web-options', hidden: true });
  frame(
    idle && h('p', { class: 'banner warn', role: 'status' }, glyph('clock', 16), h('span', { class: 'grow' }, t('webIdle'))),
    more && h('button', { class: 'link', type: 'button', on: { click: () => void wallet.load() } }, glyph('back', 18), t('back')),
    h('h2', { class: 'web-title' }, t('compTitle')),
    !more && h('p', { class: 'muted' }, t('webIntro')),
    !more && h('ul', { class: 'ob-values' }, point('lock', t('webPt1')), point('scan', t('webPt2')), point('wallet', t('webPt3'))),
    options,
    qrWrap,
    wait,
    err,
    retry,
    !more && h('p', { class: 'small muted center-text' }, `${t('webNoApp')} `, h('a', { href: 'https://kalyxwallet.com/download', target: '_blank', rel: 'noopener noreferrer' }, 'kalyxwallet.com/download')),
  );
  const fail = (r: { error?: string }) => {
    box.remove();
    wait.remove();
    err.textContent = errorText(r.error);
    retry.hidden = false;
  };
  const st = await send<{ uri: string }>({ type: 'companion:start', label: t('phoneBadge') });
  if (!st.ok) return fail(st);
  box.classList.remove('skel');
  box.removeAttribute('style');
  box.replaceChildren(qrSvg(st.uri, 200));
  box.setAttribute('aria-label', t('compTitle'));
  options.replaceChildren(...linkOptions(st.uri, onPhone, qrWrap));
  options.hidden = false;
  const got = await send<{ candidate: Candidate }>({ type: 'companion:wait' });
  if (!got.ok) return fail(got);
  confirmScreen(got.candidate);
}

/** Ouvrir l'app sur ce téléphone, afficher le QR pour un autre appareil, copier le lien. */
function linkOptions(uri: string, onPhone: boolean, qrWrap: HTMLElement): Node[] {
  const encoded = encodeURIComponent(uri);
  const open = () => {
    // L'app s'ouvre ; cet onglet reste ouvert et reçoit l'accord. App absente : la page relais propose de l'installer.
    location.href = `kalyx://wc?uri=${encoded}`;
    setTimeout(() => {
      if (!document.hidden) window.open(`https://kalyxwallet.com/wc?uri=${encoded}`, '_blank', 'noopener,noreferrer');
    }, 1500);
  };
  const label = h('span', {}, t('webCopyLink'));
  const copy = h('button', { class: 'btn ghost', type: 'button', 'data-testid': 'copy-link' }, glyph('copy', 16), label);
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(uri);
      label.textContent = t('webCopied');
      setTimeout(() => (label.textContent = t('webCopyLink')), 2500);
    } catch {
      /* presse-papiers refusé : le QR reste là */
    }
  });
  const toggle = h('button', { class: 'link small center-self', type: 'button' }, t('webShowQr'));
  toggle.addEventListener('click', () => {
    qrWrap.hidden = !qrWrap.hidden;
    toggle.textContent = t(qrWrap.hidden ? 'webShowQr' : 'webHideQr');
  });
  return [
    ...(onPhone
      ? [
          h('button', { class: 'btn', type: 'button', 'data-testid': 'open-app', on: { click: open } }, glyph('walletconnect', 18), t('webOpenApp')),
          h('p', { class: 'small muted center-text' }, t('webSameDevice')),
          toggle,
        ]
      : []),
    copy,
    h('p', { class: 'small muted center-text' }, t('webCopyHint')),
  ];
}

function confirmScreen(c: Candidate) {
  const err = h('p', { class: 'error', role: 'alert' });
  const decide = async (accept: boolean, btn: HTMLButtonElement) => {
    btn.disabled = true;
    const r = await send({ type: 'companion:confirm', topic: c.topic, accept });
    if (!r.ok) {
      btn.disabled = false;
      err.textContent = errorText(r.error);
      return;
    }
    stamp();
    if (accept) void wallet.load(true);
    else void linkScreen();
  };
  const yes = h('button', { class: 'btn', type: 'button', 'data-testid': 'comp-yes' }, t('compConfirmYes'));
  const no = h('button', { class: 'btn secondary', type: 'button' }, t('compConfirmNo'));
  yes.addEventListener('click', () => void decide(true, yes));
  no.addEventListener('click', () => void decide(false, no));
  frame(
    h('h2', { class: 'web-title' }, t('compConfirmTitle')),
    h('p', { class: 'muted' }, t('compConfirmBody')),
    !!c.peer.name && h('p', { class: 'small muted' }, `${t('compDevice')} : `, h('strong', {}, c.peer.name)),
    h('p', { class: 'small' }, t('compWallets', { w: c.wallets.length, a: c.wallets.reduce((n, w) => n + w.accounts.length, 0) })),
    ...c.wallets.map((w) => {
      const a = w.accounts[0];
      return h(
        'div',
        { class: 'card stack', style: 'gap:6px' },
        h('strong', {}, `${w.label || t('phoneBadge')} · ${t('compAccounts', { n: w.accounts.length })}`),
        h('div', { class: 'acct-addrs' }, ...([a?.evm && ['EVM', a.evm], a?.solana && ['SOL', a.solana], a?.bitcoin && ['BTC', a.bitcoin]].filter((x): x is [string, string] => !!x).map(([k, v]) => h('span', { class: 'chip-addr' }, h('b', {}, k), h('span', { class: 'mono' }, short(v)))))),
      );
    }),
    err,
    yes,
    no,
  );
}

declare const __KALYX_WEB_TEST__: boolean;
if (__KALYX_WEB_TEST__) (window as unknown as { __kalyxWebTest: unknown }).__kalyxWebTest = { host, load: () => wallet.load(true), linkOptions: (uri: string, phone: boolean) => linkOptions(uri, phone, h('div')) };

async function boot() {
  // Revenu après plus de 30 min : on repart de zéro (la liaison précédente est fermée).
  const last = lastActive();
  if (last && Date.now() - last > IDLE_MS) return signOut(true);
  stamp();
  await host.ready();
  const r = await send<{ wallets?: unknown[] }>({ type: 'home:get' });
  if (!r.ok || !r.wallets?.length) return linkScreen();
  await wallet.load(true);
  void heartbeat();
}

setInterval(() => {
  if (Date.now() - lastActive() > IDLE_MS) void signOut(true);
}, 60_000);
setInterval(() => void heartbeat(), 3 * 3_600_000);
void boot();
