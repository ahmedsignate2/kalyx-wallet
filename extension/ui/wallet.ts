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
import { openOnboarding } from './screens';
import { sendScreen } from './send';
import { receiveScreen } from './receive';
import { whitelistScreen } from './whitelistScreen';
import { sitesScreen } from './sitesScreen';
import { errorText, LOCALE, t } from './i18n';
import { groupByDay } from '../../src/domain/tx/humanize';
import { AUTO_LOCK_CHOICES } from '../lib/policy';
import type { ActivityRow, ActivityView, HoldingView, PortfolioView } from '../lib/portfolio';

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

  function header() {
    const { w } = current();
    const select = h(
      'select',
      {
        class: 'account',
        'aria-label': t('account', { n: '' }).trim(),
        on: {
          change: async () => {
            const [walletId, index] = select.value.split('|');
            await send({ type: 'home:select', walletId, index: Number(index) });
            activity = null;
            await load();
          },
        },
      },
      ...(data?.wallets ?? []).flatMap((wl) =>
        wl.accounts.map((a) => h('option', { value: `${wl.id}|${a.index}`, selected: wl.id === w?.id && a.index === data?.selected?.index }, `${wl.label} · ${t('account', { n: a.index + 1 })}`)),
      ),
    );
    const icon = (label: string, glyph: string, fn: () => void) => h('button', { class: 'icon', type: 'button', title: label, 'aria-label': label, on: { click: fn } }, glyph);
    return h(
      'header',
      { class: 'bar' },
      h('img', { src: '/icon/128.png', alt: '' }),
      select,
      opts.mode === 'popup' && icon(t('openSidePanel'), '◫', openSidePanel),
      icon(t('settings'), '⚙', settings),
      icon(t('lock'), '🔒', async () => (await send({ type: 'vault:lock' }), opts.onLocked())),
    );
  }

  function addresses() {
    const { a } = current();
    const chip = (tag: string, addr?: string) =>
      addr &&
      h(
        'button',
        {
          class: 'chip',
          type: 'button',
          title: t('copy'),
          on: {
            click: async (e) => {
              await navigator.clipboard.writeText(addr);
              const b = e.currentTarget as HTMLElement;
              b.dataset.copied = '1';
              b.lastChild!.textContent = t('copied');
              setTimeout(() => {
                delete b.dataset.copied;
                b.lastChild!.textContent = short(addr);
              }, 1400);
            },
          },
        },
        h('b', {}, tag),
        h('span', { class: 'mono' }, short(addr)),
      );
    return h('div', { class: 'chips' }, chip('EVM', a?.evm), chip('SOL', a?.solana));
  }

  function summary() {
    const p = data?.portfolio;
    const total = p?.total;
    const pnl = p?.pnl24h;
    const firstLoad = !p?.at && refreshing;
    return h(
      'section',
      { class: 'summary' },
      h('p', { class: 'small muted' }, total == null ? t(firstLoad ? 'firstLoad' : 'totalUnknown') : t('total')),
      h('p', { class: 'total', 'data-testid': 'total' }, total == null ? '—' : money(total)),
      pnl != null && p?.pnl24hPct != null && h('p', { class: `small ${pnl >= 0 ? 'up' : 'down'}` }, `${pnl >= 0 ? '+' : '−'}${money(Math.abs(pnl))} (${pnl >= 0 ? '+' : '−'}${Math.abs(p.pnl24hPct).toFixed(2)} %) · 24 h`),
      h('p', { class: 'small muted status' }, refreshing ? t('refreshing') : p?.at ? t('updated', { t: ago(p.at) }) : ''),
    );
  }

  /** Retour à l'écran principal après Envoyer/Recevoir : relu (un envoi a changé les soldes). */
  const home = () => void load();

  function actions() {
    return h(
      'div',
      { class: 'actions' },
      h('button', { class: 'btn', type: 'button', on: { click: () => ((away = true), sendScreen(app, home)) } }, `↑ ${t('send')}`),
      h('button', { class: 'btn secondary', type: 'button', on: { click: () => ((away = true), void receiveScreen(app, home, { close: opts.mode === 'popup' })) } }, `↓ ${t('receive')}`),
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
          h('span', {}, t('backupBanner')),
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
      !!p?.failed.length && h('div', { class: 'banner warn', role: 'status' }, h('span', {}, t(p.main.length || p.small.length || p.hidden.length ? 'networksDown' : 'networksDownNoData', { list: names(p.failed) }))),
      lastError && h('div', { class: 'banner warn' }, h('span', {}, t('loadFailed')), h('button', { type: 'button', on: { click: () => void refresh() } }, t('retry'))),
    );
  }

  function tokenLogo(src: string | undefined, symbol: string, chainLogo?: string) {
    const fallback = () => h('span', { class: 'logo letter' }, symbol.slice(0, 1).toUpperCase());
    const main = src ? h('img', { class: 'logo', src, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' }) : chainLogo ? h('img', { class: 'logo', src: chainLogo, alt: '' }) : fallback();
    if (main instanceof HTMLImageElement) main.addEventListener('error', () => main.replaceWith(fallback()), { once: true });
    return h('span', { class: 'logos' }, main, src && chainLogo ? h('img', { class: 'badge', src: chainLogo, alt: '' }) : null);
  }

  function tokenRow(x: HoldingView) {
    return h(
      'div',
      { class: `row${x.verified ? '' : ' unverified'}` },
      tokenLogo(x.logo, x.symbol, x.chainLogo),
      h('div', { class: 'grow' }, h('strong', {}, x.symbol), h('p', { class: 'small muted' }, x.chainName)),
      h('div', { class: 'right' }, h('strong', {}, x.verified && x.price > 0 ? money(x.fiat) : '—'), h('p', { class: 'small muted' }, `${x.amount} ${x.symbol}`)),
    );
  }

  function tokens() {
    const p = data?.portfolio;
    if (!p) return h('p', { class: 'muted empty' }, '');
    const list: (Node | false | null)[] = [];
    if (!p.main.length && !p.small.length && p.at && !p.failed.length) list.push(h('p', { class: 'muted empty' }, t('noTokens')));
    list.push(...p.main.map(tokenRow));
    if (p.small.length) list.push(h('details', {}, h('summary', {}, t('smallBalances', { n: p.small.length })), ...p.small.map(tokenRow)));
    if (p.hidden.length) list.push(h('details', { class: 'hidden-tokens' }, h('summary', {}, t('hiddenTokens', { n: p.hidden.length })), ...p.hidden.map(tokenRow)));
    if (p.erc20Unavailable) list.push(h('p', { class: 'small muted note' }, t('erc20Soon')));
    return h('div', { class: 'list' }, ...list);
  }

  function activityRow(r: ActivityRow) {
    const inner = [
      h('img', { class: 'logo', src: r.chainLogo ?? '/icon/32.png', alt: '' }),
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
    if (!activity) return h('p', { class: 'muted empty' }, activityLoading ? t('refreshing') : '');
    const groups = groupByDay(activity.rows, Date.now(), LOCALE, { today: t('today'), yesterday: t('yesterday') });
    return h(
      'div',
      { class: 'list' },
      !!activity.failed.length && h('div', { class: 'banner warn' }, h('span', {}, t('networksDownActivity', { list: names(activity.failed) }))),
      activityLoading && h('p', { class: 'small muted' }, t('refreshing')),
      !activity.rows.length && !activityLoading && !activity.failed.length && h('p', { class: 'muted empty' }, t('noActivity')),
      ...groups.flatMap((g) => [h('p', { class: 'day small muted' }, g.label), ...g.items.map(activityRow)]),
      activity.hiddenCount > 0 && h('p', { class: 'small muted note' }, t('hiddenActivity', { n: activity.hiddenCount })),
    );
  }

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
              tab = id;
              render();
              if (id === 'activity') void loadActivity(false);
            },
          },
        },
        label,
      );
    return h('div', { class: 'tabs', role: 'tablist' }, b('tokens', t('tabTokens')), b('activity', t('tabActivity')));
  }

  function render() {
    if (!data) return;
    away = false;
    app.replaceChildren(header(), addresses(), summary(), actions(), banners(), tabs(), tab === 'tokens' ? tokens() : activityList());
  }

  /* ── Réglages ── */
  function settings() {
    away = true;
    const fiat = h('select', { on: { change: async () => (await send({ type: 'home:set-fiat', fiat: fiat.value }), await load()) } }, ...FIATS.map((f) => h('option', { value: f, selected: f === data?.fiat }, f.toUpperCase())));
    const lock = h(
      'select',
      { on: { change: () => void send({ type: 'vault:set-auto-lock', minutes: Number(lock.value) }) } },
      ...AUTO_LOCK_CHOICES.map((m) => h('option', { value: String(m), selected: m === data?.status.autoLockMin }, t('minutes', { n: m }))),
    );
    // Redemander le mot de passe pour signer (désactivé par défaut) : état lu puis bouton bascule.
    const askPw = h('button', { class: 'btn secondary', type: 'button', 'data-testid': 'ask-password' }, t('askPwTitle'));
    void send<{ on: boolean }>({ type: 'settings:get-ask-password' }).then((r) => {
      const on = !!(r.ok && r.on);
      askPw.textContent = `${t('askPwTitle')} : ${on ? t('on') : t('off')}`;
      askPw.onclick = async () => {
        await send({ type: 'settings:set-ask-password', on: !on });
        settings();
      };
    });
    app.replaceChildren(
      h('header', { class: 'bar' }, h('button', { class: 'link', type: 'button', on: { click: () => render() } }, `← ${t('back')}`)),
      h(
        'div',
        { class: 'stack' },
        h('h1', {}, t('settings')),
        h('label', { class: 'small muted' }, t('currency')),
        fiat,
        h('label', { class: 'small muted' }, t('autoLock')),
        lock,
        askPw,
        h('p', { class: 'small muted' }, t('askPwBody')),
        h('button', { class: 'btn secondary', type: 'button', on: { click: () => void sitesScreen(app, () => settings()) } }, t('sitesTitle')),
        h('button', { class: 'btn secondary', type: 'button', on: { click: () => whitelistScreen(app, () => settings()) } }, t('wlTitle')),
        h('button', { class: 'btn secondary', type: 'button', on: { click: () => void openOnboardingTab() } }, t('addWallet')),
      ),
    );
  }

  const openOnboardingTab = () => openOnboarding(opts.mode === 'popup');

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
