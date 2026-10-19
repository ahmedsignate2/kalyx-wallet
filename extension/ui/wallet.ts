/**
 * PORTEFEUILLE — l'écran principal, le même pour le popup et le panneau
 * latéral (seule la largeur change).
 *
 * Ordre d'affichage : le dernier cliché (disque, sans réseau) est dessiné
 * tout de suite, puis le réseau est relu et l'écran redessiné. Rien n'est
 * jamais affiché à 0 faute de réponse : un réseau muet est nommé, un total
 * inconnu est dit inconnu.
 *
 * Tout le texte passe par `h` (textContent) : un nom de token ou une adresse
 * venus d'un indexeur ne peuvent pas injecter de HTML.
 */
import { h, send } from './dom';
import { glyph } from './glyph';
import { avatar } from './avatar';
import { openSheet } from './sheet';
import { cascade, countUp, navIn, pulse } from './motion';
import { landscape } from './landscape';
import { openOnboarding } from './screens';
import { sendScreen } from './send';
import { receiveScreen } from './receive';
import { whitelistScreen } from './whitelistScreen';
import { sitesScreen } from './sitesScreen';
import { errorText, LOCALE, t } from './i18n';
import { groupByDay } from '../../src/domain/tx/humanize';
import { AUTO_LOCK_CHOICES } from '../lib/policy';
import type { ActivityRow, ActivityView, HoldingView, PortfolioView } from '../lib/portfolio';

const VERSION = (() => {
  const m = browser.runtime.getManifest();
  return m.version_name ?? m.version;
})();
const SUPPORT_EMAIL = 'support@kalyxwallet.com';

interface WalletMeta {
  id: string;
  label: string;
  backedUp: boolean;
  accounts: { index: number; label: string; evm?: string; solana?: string }[];
}

interface HomeData {
  status: { hasVault: boolean; unlocked: boolean; autoLockMin: number; waitMs: number };
  wallets?: WalletMeta[];
  selected?: { walletId: string; index: number } | null;
  fiat?: string;
  portfolio?: (PortfolioView & { stale: boolean }) | null;
}

export interface WalletUiOptions {
  /** Popup : bouton « panneau latéral ». Panneau : pas de bouton (on y est déjà). */
  mode: 'popup' | 'panel';
  /** Écrans sans coffre (ou sans portefeuille) et verrouillé, fournis par la page. */
  onNoVault: (hasVault: boolean) => void;
  onLocked: () => void;
}

const FIATS = ['eur', 'usd', 'gbp', 'chf', 'jpy', 'cad', 'aud'];
const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');
/** Quatre réseaux nommés au plus, puis « et N autres ». */
const names = (list: string[]) => (list.length <= 4 ? list.join(', ') : t('andMore', { list: list.slice(0, 4).join(', '), n: list.length - 4 }));

export function mountWallet(app: HTMLElement, opts: WalletUiOptions) {
  let data: HomeData | null = null;
  let tab: 'tokens' | 'activity' = 'tokens';
  let refreshing = false;
  let activity: (ActivityView & { stale?: boolean }) | null = null;
  let activityLoading = false;
  let lastError = '';
  /** Sur un autre écran (envoyer, recevoir, réglages), revenir sur la fenêtre ne l'efface pas. */
  let away = false;
  /** La liste entre en cascade au premier affichage réel, au changement d'onglet ou de compte — jamais à une actualisation. */
  let animateList = true;
  /** Dernier solde affiché (et sa devise) : le nouveau compte à partir de lui. */
  let shownTotal: number | null = null;
  let shownFiat = '';
  /** Écran quitté → au retour, l'accueil glisse depuis la gauche. */
  const go = (fn: () => unknown) => () => {
    away = true;
    void fn();
    navIn(app, 'fwd');
  };

  const money = (n: number) => new Intl.NumberFormat(LOCALE, { style: 'currency', currency: (data?.fiat ?? 'usd').toUpperCase() }).format(n);
  const ago = (at: number) => {
    const s = Math.max(0, Math.round((Date.now() - at) / 1000));
    if (s < 60) return t('justNow');
    const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
    return s < 3600 ? rtf.format(-Math.round(s / 60), 'minute') : s < 86400 ? rtf.format(-Math.round(s / 3600), 'hour') : rtf.format(-Math.round(s / 86400), 'day');
  };

  /* ── Données ── */
  async function load(first = false) {
    const r = await send<HomeData>({ type: 'home:get' }).catch(() => null);
    if (!r?.ok) return void app.replaceChildren(h('p', { class: 'error' }, t('unavailable')));
    if (!r.status.hasVault) return opts.onNoVault(false);
    if (!r.status.unlocked) return opts.onLocked();
    if (!r.wallets?.length) return opts.onNoVault(true);
    data = r;
    render();
    if (first) {
      document.body.dataset.firstPaint = String(Math.round(performance.now()));
      if (opts.mode === 'popup') touch(); // ouvrir le popup est un geste de l'utilisateur
    }
    if (r.portfolio?.stale !== false) void refresh();
    if (tab === 'activity') void loadActivity(true);
  }

  /** Redessine l'écran principal seulement s'il est affiché. */
  const redraw = () => {
    if (!away) render();
  };

  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    lastError = '';
    redraw();
    const r = await send<{ portfolio: PortfolioView }>({ type: 'portfolio:refresh' }).catch(() => null);
    refreshing = false;
    if (r?.ok && data) data.portfolio = { ...r.portfolio, stale: false };
    else if (r && !r.ok && (r.error === 'LOCKED' || r.error === 'NO_VAULT')) return void load();
    else lastError = errorText(r?.error);
    redraw();
  }

  async function loadActivity(fresh: boolean) {
    if (activityLoading) return;
    if (!activity) {
      const c = await send<{ activity: ActivityView & { stale: boolean } }>({ type: 'activity:get', fresh: false });
      if (c.ok) activity = c.activity;
      redraw();
      if (c.ok && !c.activity.stale && !fresh) return;
    }
    activityLoading = true;
    redraw();
    const r = await send<{ activity: ActivityView }>({ type: 'activity:get', fresh: true }).catch(() => null);
    activityLoading = false;
    if (r?.ok) activity = r.activity;
    redraw();
  }

  /* ── Rendu ── */
  function current() {
    const w = data?.wallets?.find((x) => x.id === data?.selected?.walletId);
    const a = w?.accounts.find((x) => x.index === data?.selected?.index);
    return { w, a };
  }

  const seedOf = (w?: WalletMeta, a?: WalletMeta['accounts'][number]) => a?.evm ?? a?.solana ?? `${w?.id}:${a?.index}`;

  /** En-tête : le compte (avatar, nom, adresse) ouvre le choix des comptes ; les gestes à droite. */
  function header() {
    const { w, a } = current();
    const icon = (label: string, name: string, fn: () => void) => h('button', { class: 'icon glass', type: 'button', title: label, 'aria-label': label, on: { click: fn } }, glyph(name, 20));
    return h(
      'header',
      { class: 'bar' },
      h(
        'button',
        { class: 'acct', type: 'button', 'aria-haspopup': 'dialog', 'data-testid': 'account', title: t('chooseAccount'), on: { click: pickAccount } },
        avatar(seedOf(w, a), 36),
        h(
          'span',
          { class: 'acct-text' },
          h('span', { class: 'acct-name' }, h('span', { class: 'ellipsis' }, a ? t('account', { n: a.index + 1 }) : ''), glyph('caretDown', 14)),
          h('span', { class: 'acct-sub' }, h('span', { class: 'ellipsis' }, w?.label ?? ''), h('span', { class: 'beta', title: VERSION }, t('beta'))),
        ),
      ),
      h('span', { class: 'spacer' }),
      opts.mode === 'popup' && icon(t('openSidePanel'), 'sidebar', openSidePanel),
      icon(t('settings'), 'gear', () => settings()),
      icon(t('lock'), 'lock', async () => (await send({ type: 'vault:lock' }), opts.onLocked())),
    );
  }

  /** Choix du compte : une feuille, groupée par portefeuille, le compte courant coché. */
  function pickAccount() {
    const sel = data?.selected;
    const groups = (data?.wallets ?? []).map((wl) =>
      h(
        'section',
        { class: 'group' },
        h('p', { class: 'group-title' }, wl.label),
        h(
          'div',
          { class: 'list card' },
          ...wl.accounts.map((ac) => {
            const on = wl.id === sel?.walletId && ac.index === sel?.index;
            return h(
              'button',
              {
                class: `row link-row acct-row${on ? ' on' : ''}`,
                type: 'button',
                'aria-current': on ? 'true' : false,
                on: {
                  click: async () => {
                    sheet.close();
                    if (on) return;
                    await send({ type: 'home:select', walletId: wl.id, index: ac.index });
                    activity = null;
                    animateList = true;
                    shownTotal = null;
                    await load();
                  },
                },
              },
              avatar(seedOf(wl, ac), 36),
              h('span', { class: 'grow' }, h('strong', {}, t('account', { n: ac.index + 1 })), h('p', { class: 'small muted mono' }, short(ac.evm ?? ac.solana))),
              on ? h('span', { class: 'tick' }, glyph('check', 18)) : null,
            );
          }),
        ),
      ),
    );
    const sheet = openSheet(
      t('chooseAccount'),
      ...groups,
      h('button', { class: 'btn secondary', type: 'button', on: { click: () => (sheet.close(), void openOnboardingTab()) } }, glyph('add', 18), t('addWallet')),
    );
  }

  /** Les adresses du compte, entières, chacune copiable. */
  function showAddresses() {
    const { a } = current();
    const row = (tag: string, addr?: string) => {
      if (!addr) return null;
      const label = h('span', {}, t('copy'));
      const btn = h(
        'button',
        {
          class: 'chip copy',
          type: 'button',
          on: {
            click: async () => {
              await navigator.clipboard.writeText(addr);
              btn.dataset.copied = '1';
              label.textContent = t('copied');
              pulse(btn);
              setTimeout(() => (delete btn.dataset.copied, (label.textContent = t('copy'))), 1400);
            },
          },
        },
        glyph('copy', 16),
        label,
      );
      return h('div', { class: 'addr-card card' }, h('p', { class: 'micro' }, tag), h('p', { class: 'addr mono' }, addr), btn);
    };
    openSheet(t('myAddresses'), row('EVM · Ethereum, Base, Arbitrum…', a?.evm), row('Solana', a?.solana));
  }

  function summary() {
    const p = data?.portfolio;
    const total = p?.total;
    const pnl = p?.pnl24h;
    const firstLoad = !p?.at && refreshing;
    const up = (pnl ?? 0) >= 0;
    const status = refreshing ? t('refreshing') : p?.at ? t('updated', { t: ago(p.at) }) : total == null ? t(firstLoad ? 'firstLoad' : 'totalUnknown') : '';
    return h(
      'section',
      { class: 'summary' },
      // Le solde, en grand sur le ciel ; inconnu reste « — », jamais un 0 inventé. Premier chargement : un reflet.
      h('p', { class: `total${total == null && firstLoad ? ' skel' : ''}`, 'data-testid': 'total' }, total == null ? '—' : money(total)),
      pnl != null && p?.pnl24hPct != null
        ? h('p', { class: `pill ${up ? 'gain' : 'loss'}` }, glyph(up ? 'trendUp' : 'trendDown', 14), `${up ? '+' : '−'}${money(Math.abs(pnl))} (${up ? '+' : '−'}${Math.abs(p.pnl24hPct).toFixed(1)} %) · 24 h`)
        : null,
      h('p', { class: 'pill quiet status' }, refreshing ? h('img', { class: 'spin-logo', src: '/icon/32.png', alt: '' }) : null, status),
      addressPill(),
    );
  }

  /** L'adresse du compte sous le solde : un clic ouvre les adresses entières, à copier. */
  function addressPill() {
    const { a } = current();
    const addr = a?.evm ?? a?.solana;
    return addr ? h('button', { class: 'pill addr-pill', type: 'button', title: t('myAddresses'), 'aria-label': t('myAddresses'), on: { click: showAddresses } }, h('span', { class: 'mono' }, short(addr)), glyph('copy', 14)) : null;
  }

  /** Retour à l'écran principal après Envoyer/Recevoir : relu (un envoi a changé les soldes). */
  const home = () => void load();

  /** Gestes : des boutons ronds, le libellé dessous. Envoyer est le geste principal. */
  function actions() {
    const act = (cls: string, icon: string, label: string, fn: () => void) =>
      h('button', { class: `act ${cls}`, type: 'button', 'aria-label': label, on: { click: fn } }, h('span', { class: 'disc' }, glyph(icon, 22)), h('span', { class: 'act-label' }, label));
    return h(
      'nav',
      { class: 'acts' },
      act('send primary', 'send', t('send'), go(() => sendScreen(app, home))),
      act('rx', 'receive', t('receive'), go(() => receiveScreen(app, home, { close: opts.mode === 'popup' }))),
      act('sites', 'dapps', t('sitesShort'), go(() => sitesScreen(app, home))),
    );
  }

  function banners() {
    const { w } = current();
    const p = data?.portfolio;
    return h(
      'div',
      { class: 'stack', style: 'gap:8px' },
      w &&
        !w.backedUp &&
        h(
          'div',
          { class: 'banner' },
          glyph('warning', 18),
          h('span', { class: 'grow' }, t('backupBanner')),
          h(
            'button',
            {
              type: 'button',
              on: {
                click: async () => {
                  await browser.tabs.create({ url: browser.runtime.getURL(`/onboarding.html#verify=${encodeURIComponent(w.id)}`) });
                  if (opts.mode === 'popup') window.close();
                },
              },
            },
            t('verifyNow'),
          ),
        ),
      // Réseaux muets : une ligne, le détail en dépliant (le total reste « — » ou partiel, jamais faux).
      !!p?.failed.length &&
        h(
          'details',
          { class: 'banner warn', role: 'status' },
          h('summary', {}, glyph('alert', 16), h('span', { class: 'grow' }, t('networksShort', { n: p.failed.length })), glyph('caretDown', 14)),
          h('p', {}, t(p.main.length || p.small.length || p.hidden.length ? 'networksDown' : 'networksDownNoData', { list: names(p.failed) })),
        ),
      lastError && h('div', { class: 'banner warn' }, glyph('alert', 16), h('span', { class: 'grow' }, t('loadFailed')), h('button', { type: 'button', on: { click: () => void refresh() } }, t('retry'))),
    );
  }

  function tokenLogo(src: string | undefined, symbol: string, chainLogo?: string) {
    const fallback = () => h('span', { class: 'logo letter' }, symbol.slice(0, 1).toUpperCase());
    const main = src ? h('img', { class: 'logo', src, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' }) : chainLogo ? h('img', { class: 'logo', src: chainLogo, alt: '' }) : fallback();
    if (main instanceof HTMLImageElement) main.addEventListener('error', () => main.replaceWith(fallback()), { once: true });
    return h('span', { class: 'logos' }, main, src && chainLogo ? h('img', { class: 'badge', src: chainLogo, alt: '' }) : null);
  }

  const pct = (c: number) => `${c >= 0 ? '+' : '−'}${Math.abs(c).toFixed(2)} %`;

  function tokenRow(x: HoldingView) {
    const priced = x.verified && x.price > 0;
    return h(
      'button',
      { class: `row link-row token${x.verified ? '' : ' unverified'}`, type: 'button', title: x.name || x.symbol, on: { click: () => tokenSheet(x) } },
      tokenLogo(x.logo, x.symbol, x.chainLogo),
      // Le token et sa quantité à gauche ; la valeur et sa variation sur 24 h à droite.
      h('div', { class: 'grow' }, h('strong', {}, x.symbol), h('p', { class: 'small muted' }, `${x.amount} ${x.symbol}`)),
      h(
        'div',
        { class: 'right' },
        h('strong', {}, priced ? money(x.fiat) : '—'),
        priced && x.change24h != null ? h('p', { class: `small ${x.change24h >= 0 ? 'up' : 'down'}` }, pct(x.change24h)) : h('p', { class: 'small muted' }, x.chainName),
      ),
    );
  }

  /** Détail d'un token : valeur, prix, variation, quantité, réseau ; et les gestes. */
  function tokenSheet(x: HoldingView) {
    const priced = x.verified && x.price > 0;
    const kv = (k: string, v: Node | string) => h('div', { class: 'kv-row' }, h('span', { class: 'muted' }, k), typeof v === 'string' ? h('strong', {}, v) : v);
    const sheet = openSheet(
      x.name || x.symbol,
      h(
        'section',
        { class: 'token-hero' },
        tokenLogo(x.logo, x.symbol, x.chainLogo),
        h('p', { class: 'token-value' }, priced ? money(x.fiat) : `${x.amount} ${x.symbol}`),
        priced && x.change24h != null ? h('p', { class: `pill ${x.change24h >= 0 ? 'gain' : 'loss'}` }, glyph(x.change24h >= 0 ? 'trendUp' : 'trendDown', 14), `${pct(x.change24h)} · 24 h`) : null,
      ),
      h(
        'div',
        { class: 'card kv-card' },
        kv(t('tdBalance'), `${x.amount} ${x.symbol}`),
        priced ? kv(t('tdPrice'), money(x.price)) : null,
        kv(t('tdNetwork'), h('span', { class: 'net' }, x.chainLogo ? h('img', { src: x.chainLogo, alt: '' }) : null, x.chainName)),
      ),
      !x.verified && h('div', { class: 'banner warn' }, glyph('warning', 16), h('span', { class: 'grow' }, t('tdUnverified'))),
      h(
        'div',
        { class: 'actions' },
        h('button', { class: 'btn', type: 'button', on: { click: () => (sheet.close(), go(() => sendScreen(app, home))()) } }, glyph('send', 18), t('send')),
        h('button', { class: 'btn secondary', type: 'button', on: { click: () => (sheet.close(), go(() => receiveScreen(app, home, { close: opts.mode === 'popup' }))()) } }, glyph('receive', 18), t('receive')),
      ),
    );
  }

  /** Lignes fantômes pendant le premier chargement : la place est réservée, rien ne saute. */
  const skeleton = (n: number) => h('div', { class: 'list card', 'aria-hidden': 'true' }, ...Array.from({ length: n }, () => h('div', { class: 'row' }, h('span', { class: 'logo skel' }), h('div', { class: 'grow' }, h('i', { class: 'skel line w40' }), h('i', { class: 'skel line w25' })), h('div', { class: 'right' }, h('i', { class: 'skel line w50' })))));

  function tokens() {
    const p = data?.portfolio;
    if (!p || (!p.at && refreshing && !p.main.length)) return skeleton(4);
    const list: (Node | false | null)[] = [];
    if (!p.main.length && !p.small.length && p.at && !p.failed.length) list.push(h('p', { class: 'empty' }, t('noTokens')));
    // Une carte par groupe (Card de l'app) : les lignes portent leurs séparateurs.
    if (p.main.length) list.push(h('div', { class: 'list card' }, ...p.main.map(tokenRow)));
    if (p.small.length) list.push(h('details', {}, h('summary', {}, t('smallBalances', { n: p.small.length })), h('div', { class: 'list card' }, ...p.small.map(tokenRow))));
    if (p.hidden.length) list.push(h('details', { class: 'hidden-tokens' }, h('summary', {}, t('hiddenTokens', { n: p.hidden.length })), h('div', { class: 'list card' }, ...p.hidden.map(tokenRow))));
    if (p.erc20Partial) list.push(h('p', { class: 'small muted note' }, t('erc20Partial')));
    return h('div', { class: 'stack', style: 'gap:12px' }, ...list);
  }

  function activityRow(r: ActivityRow) {
    const inner = [
      h('span', { class: 'logos' }, h('span', { class: `logo gesture ${r.tone === 'up' ? 'up' : r.tone === 'danger' ? '' : 'out'}` }, glyph(r.tone === 'up' ? 'receive' : r.failed ? 'errorCircle' : 'send', 18)), r.chainLogo ? h('img', { class: 'badge', src: r.chainLogo, alt: '' }) : null),
      h('div', { class: 'grow' }, h('strong', {}, r.label), h('p', { class: 'small muted' }, [r.subtitle, r.chainName].filter(Boolean).join(' · '))),
      h(
        'div',
        { class: 'right' },
        h('strong', { class: r.tone === 'up' ? 'up' : r.tone === 'danger' ? 'down' : '' }, r.amount ?? ''),
        h('p', { class: 'small muted' }, r.pending ? t('pending') : r.failed ? t('failedTx') : (r.fiat ?? '')),
      ),
    ];
    return r.explorer
      ? h('a', { class: 'row link-row', href: r.explorer, target: '_blank', rel: 'noopener noreferrer', title: t('viewExplorer') }, ...inner)
      : h('div', { class: 'row' }, ...inner);
  }

  function activityList() {
    if (!activity) return h('div', { 'data-testid': 'activity' }, activityLoading ? h('span', { class: 'sr' }, t('refreshing')) : null, skeleton(3));
    const groups = groupByDay(activity.rows, Date.now(), LOCALE, { today: t('today'), yesterday: t('yesterday') });
    return h(
      'div',
      { class: 'stack', style: 'gap:12px', 'data-testid': 'activity' },
      !!activity.failed.length && h('div', { class: 'banner warn' }, glyph('alert', 16), h('span', { class: 'grow' }, t('networksDownActivity', { list: names(activity.failed) }))),
      activityLoading && h('p', { class: 'small muted' }, t('refreshing')),
      !activity.rows.length && !activityLoading && !activity.failed.length && h('p', { class: 'empty' }, t('noActivity')),
      // Un jour = une carte, comme l'activité de l'app.
      ...groups.flatMap((g) => [h('p', { class: 'day' }, g.label), h('div', { class: 'list card' }, ...g.items.map(activityRow))]),
      activity.hiddenCount > 0 && h('p', { class: 'small muted note' }, t('hiddenActivity', { n: activity.hiddenCount })),
    );
  }

  /** Onglets : la pilule glisse de l'ancien onglet vers le nouveau. */
  let shownTab: 'tokens' | 'activity' = tab;
  function tabs() {
    const b = (id: typeof tab, label: string) =>
      h(
        'button',
        {
          class: `tab${tab === id ? ' on' : ''}`,
          type: 'button',
          role: 'tab',
          'aria-selected': String(tab === id),
          on: {
            click: () => {
              if (tab === id) return;
              tab = id;
              animateList = true;
              render();
              if (id === 'activity') void loadActivity(false);
            },
          },
        },
        label,
      );
    const idx = (x: typeof tab) => (x === 'tokens' ? 0 : 1);
    const el = h('div', { class: 'tabs', role: 'tablist', style: `--n:2;--i:${idx(shownTab)}` }, b('tokens', t('tabTokens')), b('activity', t('tabActivity')));
    if (shownTab !== tab) requestAnimationFrame(() => el.style.setProperty('--i', String(idx(tab))));
    shownTab = tab;
    return el;
  }

  let entered = false;
  function render() {
    if (!data) return;
    const back = away && entered;
    away = false;
    const hero = h('section', { class: 'hero on-sky' }, landscape({ veil: true, glow: 0.32 }), header(), summary(), actions());
    const pane = h('div', { class: 'pane' }, tab === 'tokens' ? tokens() : activityList());
    const sheet = h('section', { class: 'sheet' }, banners(), tabs(), pane);
    const root = h('div', { class: `home${opts.mode === 'popup' ? ' compact' : ''}${entered ? '' : ' enter'}` }, hero, sheet);
    entered = true;
    app.replaceChildren(root);
    if (back) navIn(app, 'back');
    // Cascade : seulement quand de vraies lignes arrivent (pas les squelettes, pas une actualisation).
    const rows = pane.querySelectorAll('.list:not([aria-hidden]) > .row, .day');
    if (animateList && rows.length) {
      cascade(rows);
      animateList = false;
    }
    // Solde : il compte depuis la dernière valeur affichée (même devise), sinon il s'affiche.
    const total = data.portfolio?.total ?? null;
    const fiat = data.fiat ?? '';
    const el = root.querySelector<HTMLElement>('[data-testid=total]');
    if (el && total != null && shownTotal != null && fiat === shownFiat && shownTotal !== total) countUp(el, shownTotal, total, money);
    else if (el && total != null && shownTotal == null) el.classList.add('pop');
    shownTotal = total;
    shownFiat = fiat;
  }

  /* ── Réglages ── */
  function settings(dir: 'fwd' | 'back' | 'none' = 'fwd') {
    away = true;
    if (dir !== 'none') navIn(app, dir);
    const fiat = h('select', { class: 'inline', 'aria-label': t('currency'), on: { change: async () => (await send({ type: 'home:set-fiat', fiat: fiat.value }), await load()) } }, ...FIATS.map((f) => h('option', { value: f, selected: f === data?.fiat }, f.toUpperCase())));
    const lock = h(
      'select',
      { class: 'inline', 'aria-label': t('autoLock'), on: { change: () => void send({ type: 'vault:set-auto-lock', minutes: Number(lock.value) }) } },
      ...AUTO_LOCK_CHOICES.map((m) => h('option', { value: String(m), selected: m === data?.status.autoLockMin }, t('minutes', { n: m }))),
    );
    // Redemander le mot de passe pour signer (désactivé par défaut) : un interrupteur.
    const askPw = h('button', { class: 'row link-row', type: 'button', role: 'switch', 'aria-checked': 'false', 'data-testid': 'ask-password' }, h('span', { class: 'set-ico' }, glyph('security', 18)), h('span', { class: 'grow' }, h('strong', {}, t('askPwTitle')), h('p', { class: 'small muted' }, t('askPwBody'))), h('span', { class: 'switch', 'aria-hidden': 'true' }));
    void send<{ on: boolean }>({ type: 'settings:get-ask-password' }).then((r) => {
      const on = !!(r.ok && r.on);
      askPw.setAttribute('aria-checked', String(on));
      askPw.onclick = async () => {
        askPw.setAttribute('aria-checked', String(!on));
        await send({ type: 'settings:set-ask-password', on: !on });
        settings('none');
      };
    });
    const item = (icon: string, label: string, end: Node | null, fn?: () => void, testid?: string) =>
      h(
        fn ? 'button' : 'div',
        fn ? { class: 'row link-row', type: 'button', 'data-testid': testid ?? false, on: { click: fn } } : { class: 'row' },
        h('span', { class: 'set-ico' }, glyph(icon, 18)),
        h('span', { class: 'grow' }, h('strong', {}, label)),
        end ?? glyph('chevron', 16),
      );
    const group = (title: string, ...rows: Node[]) => h('section', { class: 'group' }, h('p', { class: 'group-title' }, title), h('div', { class: 'list card' }, ...rows));
    app.replaceChildren(
      h(
        'div',
        { class: 'screen settings enter' },
        h('header', { class: 'bar' }, h('button', { class: 'link', type: 'button', on: { click: () => render() } }, glyph('back', 18), t('back'))),
        h('h1', {}, t('settings')),
        group(t('setGeneral'), item('currency', t('currency'), fiat), item('clock', t('autoLock'), lock), item('add', t('addWallet'), null, () => void openOnboardingTab())),
        group(
          t('setSecurity'),
          askPw,
          item('dapps', t('sitesTitle'), null, () => (void sitesScreen(app, () => settings('back')), navIn(app, 'fwd'))),
          item('check', t('wlTitle'), null, () => (whitelistScreen(app, () => settings('back')), navIn(app, 'fwd'))),
        ),
        group(t('setHelp'), item('support', t('reportIssue'), null, () => void reportIssue(), 'report')),
        h('p', { class: 'small muted note' }, t('reportNote')),
        h('p', { class: 'small muted note' }, `${t('version', { v: VERSION })} · ${t('beta')}`),
      ),
    );
  }

  const openOnboardingTab = () => openOnboarding(opts.mode === 'popup');

  /** Retour de bêta par e-mail : version et navigateur seulement, rien du portefeuille. */
  async function reportIssue() {
    const body = `${t('reportMailBody')}\n\n\n—\nKalyx ${VERSION}\n${navigator.userAgent}`;
    await browser.tabs.create({ url: `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(t('reportMailSubject', { v: VERSION }))}&body=${encodeURIComponent(body)}` });
  }

  async function openSidePanel() {
    const win = await browser.windows.getCurrent();
    if (win.id !== undefined) await browser.sidePanel.open({ windowId: win.id });
    window.close();
  }

  // Revenir sur la fenêtre relit le cliché (une autre vue a pu l'actualiser).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !away) void load();
  });

  /*
   * Activité RÉELLE seulement (clic, touche) : c'est elle qui repousse le
   * verrouillage automatique. Un panneau resté ouvert, qui se relit seul, ne
   * doit pas garder l'extension déverrouillée indéfiniment.
   */
  let lastTouch = 0;
  const touch = () => {
    if (Date.now() - lastTouch < 10_000) return;
    lastTouch = Date.now();
    void send({ type: 'vault:touch' });
  };
  document.addEventListener('pointerdown', touch, true);
  document.addEventListener('keydown', touch, true);

  /** Relecture silencieuse (panneau ouvert) : suit le verrouillage, sans compter comme activité. */
  async function check() {
    const st = await send<{ hasVault: boolean; unlocked: boolean }>({ type: 'vault:status' }).catch(() => null);
    if (st?.ok && !st.unlocked && data) {
      data = null;
      opts.onLocked();
    }
  }

  return { load, check };
}
