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
import { allowancesScreen } from './allowancesScreen';
import { changePasswordSheet, exportBackupSheet, manageWalletScreen } from './manageScreen';
import { addTokenSheet, networksScreen } from './assetsScreen';
import { addressWithContact, contactSheet, contactsScreen, loadContacts } from './contactsScreen';
import { errorText, LOCALE, t } from './i18n';
import { groupByDay } from '../../src/domain/tx/humanize';
import { AUTO_LOCK_CHOICES } from '../lib/policy';
import type { ActivityRow, ActivityView, HoldingView, PortfolioView } from '../lib/portfolio';
import type { NftsView, NftView } from '../lib/nfts';

const VERSION = (() => {
  const m = browser.runtime.getManifest();
  return m.version_name ?? m.version;
})();
const SUPPORT_EMAIL = 'support@kalyxwallet.com';

interface WalletMeta {
  id: string;
  label: string;
  kind?: 'seed' | 'privateKey' | 'companion';
  family?: 'evm' | 'solana';
  /** Mode compagnon : la session avec le téléphone est coupée. */
  lost?: boolean;
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
  let tab: 'tokens' | 'nfts' | 'activity' = 'tokens';
  let nfts: (NftsView & { stale?: boolean }) | null = null;
  let nftsLoading = false;
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
    if (tab === 'nfts') void loadNfts(false);
  }

  async function loadNfts(fresh: boolean) {
    if (nftsLoading) return;
    if (!nfts) {
      const c = await send<{ nfts: NftsView & { stale: boolean } }>({ type: 'nfts:get', fresh: false }).catch(() => null);
      if (c?.ok) nfts = c.nfts;
      redraw();
      if (c?.ok && !c.nfts.stale && !fresh) return;
    } else if (!fresh && !nfts.stale) return;
    nftsLoading = true;
    redraw();
    const r = await send<{ nfts: NftsView }>({ type: 'nfts:get', fresh: true }).catch(() => null);
    nftsLoading = false;
    if (r?.ok) nfts = r.nfts;
    redraw();
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
          // Compte du téléphone : le badge suffit (le nom du portefeuille le répétait, tronqué).
          w?.kind === 'companion'
            ? h('span', { class: 'acct-sub' }, h('span', { class: 'beta phone', 'data-testid': 'phone-badge' }, t('phoneBadge')))
            : h('span', { class: 'acct-sub' }, h('span', { class: 'ellipsis' }, w?.label ?? ''), h('span', { class: 'beta', title: VERSION }, t('beta'))),
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
                    nfts = null;
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
      h(
        'div',
        { class: 'actions' },
        h('button', { class: 'btn secondary', type: 'button', on: { click: () => (sheet.close(), void openOnboardingTab()) } }, glyph('add', 18), t('addWallet')),
        // Mode compagnon : un autre compte du téléphone (choisi sur le téléphone au moment du scan).
        h('button', { class: 'btn secondary', type: 'button', 'data-testid': 'link-phone', on: { click: () => (sheet.close(), void openOnboarding(opts.mode === 'popup', '#companion')) } }, glyph('scan', 18), t('compLinkMore')),
      ),
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
      act('buy', 'buy', t('buy'), buySheet),
      act('sites', 'dapps', t('sitesShort'), go(() => sitesScreen(app, home))),
    );
  }

  /** Acheter : la crypto et le réseau, puis la page Stripe dans un onglet (livraison sur ce compte). */
  async function buySheet() {
    const r = await send<{ options: { id: string; symbol: string; chain: string; logo?: string; chainLogo?: string }[] }>({ type: 'buy:options' });
    const err = h('p', { class: 'error', role: 'alert' });
    const rows = (r.ok ? r.options : []).map((o) =>
      h(
        'button',
        {
          class: 'row link-row',
          type: 'button',
          'data-testid': `buy-${o.id}`,
          on: {
            click: async (e) => {
              const b = e.currentTarget as HTMLButtonElement;
              if (b.disabled) return;
              b.disabled = true;
              err.textContent = '';
              const x = await send<{ url: string }>({ type: 'buy:stripe', option: o.id });
              b.disabled = false;
              // La raison exacte (Stripe ou relais) en plus : utile tant que l'achat est en test.
              const reason = (x as { params?: { reason?: string } }).params?.reason;
              if (!x.ok) return void (err.textContent = errorText(x.error) + (reason ? ` (${reason})` : ''));
              await browser.tabs.create({ url: x.url });
              sheet.close();
              if (opts.mode === 'popup') window.close();
            },
          },
        },
        tokenLogo(o.logo, o.symbol, o.chainLogo),
        h('span', { class: 'grow' }, h('strong', {}, o.symbol), h('p', { class: 'small muted' }, o.chain)),
        glyph('chevron', 16),
      ),
    );
    const sheet = openSheet(
      t('buyTitle'),
      rows.length ? h('div', { class: 'list card' }, ...rows) : h('p', { class: 'muted' }, errorText('NO_ACCOUNT')),
      err,
      h('p', { class: 'small muted' }, t('buyNote')),
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
      // Mode compagnon : le téléphone a coupé le lien (ou il a expiré) ; on le relie depuis l'installation.
      w?.kind === 'companion' &&
        w.lost &&
        h(
          'div',
          { class: 'banner warn', role: 'status', 'data-testid': 'companion-lost' },
          glyph('alert', 16),
          h('span', { class: 'grow' }, t('e_COMPANION_LOST')),
          h(
            'button',
            {
              type: 'button',
              on: {
                click: async () => {
                  await browser.tabs.create({ url: browser.runtime.getURL('/onboarding.html#companion') });
                  if (opts.mode === 'popup') window.close();
                },
              },
            },
            t('compOption'),
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
      h('div', { class: 'grow' }, h('strong', {}, x.symbol, x.custom ? h('span', { class: 'tag' }, t('tkAdded')) : null), h('p', { class: 'small muted' }, `${x.amount} ${x.symbol}`)),
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
    const muted = !!data?.portfolio?.muted?.some((m) => m.id === x.id);
    const err = h('p', { class: 'error', role: 'alert' });
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
      !x.verified && h('div', { class: 'banner warn' }, glyph('warning', 16), h('span', { class: 'grow' }, t(x.custom ? 'tkAddedWarn' : 'tdUnverified'))),
      h(
        'div',
        { class: 'actions' },
        h('button', { class: 'btn', type: 'button', on: { click: () => (sheet.close(), go(() => sendScreen(app, home))()) } }, glyph('send', 18), t('send')),
        h('button', { class: 'btn secondary', type: 'button', on: { click: () => (sheet.close(), go(() => receiveScreen(app, home, { close: opts.mode === 'popup' }))()) } }, glyph('receive', 18), t('receive')),
      ),
      h(
        'div',
        { class: 'list card' },
        // Masquer : seulement l'affichage (hors du total) ; le token reste envoyable.
        h('button', { class: 'row link-row', type: 'button', 'data-testid': muted ? 'show-token' : 'hide-token', on: { click: () => void setHidden(!muted) } }, h('span', { class: 'set-ico' }, glyph(muted ? 'eye' : 'eyeOff', 18)), h('span', { class: 'grow' }, h('strong', {}, t(muted ? 'tkShow' : 'tkHide')), h('p', { class: 'small muted' }, t(muted ? 'tkShowNote' : 'tkHideNote')))),
        x.custom && h('button', { class: 'row link-row', type: 'button', 'data-testid': 'remove-token', on: { click: () => void removeCustom() } }, h('span', { class: 'set-ico' }, glyph('close', 18)), h('span', { class: 'grow' }, h('strong', {}, t('tkRemove')))),
      ),
      err,
    );
    async function setHidden(hidden: boolean) {
      const r = await send({ type: 'assets:set-token', id: x.id, hidden });
      if (!r.ok) return void (err.textContent = errorText(r.error));
      sheet.close();
      await load();
    }
    async function removeCustom() {
      const contract = x.id.slice(x.id.indexOf(':') + 1);
      const r = await send({ type: 'tokens:remove', chainId: x.chainId, contract });
      if (!r.ok) return void (err.textContent = errorText(r.error));
      sheet.close();
      await load();
    }
  }

  /** Lignes fantômes pendant le premier chargement : la place est réservée, rien ne saute. */
  const skeleton = (n: number) => h('div', { class: 'list card', 'aria-hidden': 'true' }, ...Array.from({ length: n }, () => h('div', { class: 'row' }, h('span', { class: 'logo skel' }), h('div', { class: 'grow' }, h('i', { class: 'skel line w40' }), h('i', { class: 'skel line w25' })), h('div', { class: 'right' }, h('i', { class: 'skel line w50' })))));

  function tokens() {
    const p = data?.portfolio;
    if (!p || (!p.at && refreshing && !p.main.length)) return skeleton(4);
    const list: (Node | false | null)[] = [];
    const custom = p.custom ?? [];
    const muted = p.muted ?? [];
    if (!p.main.length && !p.small.length && !custom.length && p.at && !p.failed.length) list.push(h('p', { class: 'empty' }, t('noTokens')));
    // Une carte par groupe (Card de l'app) : les lignes portent leurs séparateurs.
    if (p.main.length) list.push(h('div', { class: 'list card' }, ...p.main.map(tokenRow)));
    if (custom.length) list.push(h('p', { class: 'day' }, t('tkAddedGroup')), h('div', { class: 'list card', 'data-testid': 'custom-tokens' }, ...custom.map(tokenRow)));
    if (p.small.length) list.push(h('details', {}, h('summary', {}, t('smallBalances', { n: p.small.length })), h('div', { class: 'list card' }, ...p.small.map(tokenRow))));
    if (p.hidden.length) list.push(h('details', { class: 'hidden-tokens' }, h('summary', {}, t('hiddenTokens', { n: p.hidden.length })), h('div', { class: 'list card' }, ...p.hidden.map(tokenRow))));
    if (muted.length) list.push(h('details', { class: 'hidden-tokens', 'data-testid': 'muted-tokens' }, h('summary', {}, t('tkMuted', { n: muted.length })), h('div', { class: 'list card' }, ...muted.map(tokenRow))));
    if (p.erc20Partial) list.push(h('p', { class: 'small muted note' }, t('erc20Partial')));
    list.push(
      h(
        'div',
        { class: 'actions inline-actions' },
        h('button', { class: 'chip', type: 'button', 'data-testid': 'add-token', on: { click: () => void openAddToken() } }, glyph('add', 16), t('atTitle')),
        h('button', { class: 'chip', type: 'button', 'data-testid': 'manage-networks', on: { click: go(() => networksScreen(app, home)) } }, glyph('dapps', 16), t('netTitle')),
      ),
    );
    return h('div', { class: 'stack', style: 'gap:12px' }, ...list);
  }

  /** Ajouter un token : les réseaux EVM affichés, puis relecture des soldes. */
  async function openAddToken() {
    const r = await send<{ networks: { id: string; name: string; family: string; hidden: boolean }[] }>({ type: 'assets:networks' });
    if (!r.ok) return;
    addTokenSheet(
      r.networks.filter((n) => n.family === 'evm' && !n.hidden),
      () => void refresh(),
    );
  }

  /* ── NFT (lecture seule) ── */
  function nftImage(n: NftView, cls: string) {
    const fallback = () => h('span', { class: `${cls} nft-blank` }, (n.collection || n.name).slice(0, 1).toUpperCase());
    if (!n.images.length) return fallback();
    let i = 0;
    const img = h('img', { class: cls, src: n.images[0], alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' });
    // Lien mort ou format illisible : l'image suivante, puis une case vide.
    img.addEventListener('error', () => {
      i += 1;
      if (i < n.images.length) img.src = n.images[i];
      else img.replaceWith(fallback());
    });
    return img;
  }

  function nftSheet(n: NftView) {
    const kv = (k: string, v: Node | string) => h('div', { class: 'kv-row' }, h('span', { class: 'muted' }, k), typeof v === 'string' ? h('strong', { class: 'ellipsis' }, v) : v);
    const id = n.tokenId.length > 18 ? `${n.tokenId.slice(0, 8)}…${n.tokenId.slice(-6)}` : n.tokenId;
    openSheet(
      n.name,
      h('div', { class: 'nft-hero' }, nftImage(n, 'nft-big')),
      h(
        'div',
        { class: 'card kv-card' },
        n.collection ? kv(t('nftCollection'), n.collection) : null,
        kv(t('tdNetwork'), h('span', { class: 'net' }, n.chainLogo ? h('img', { src: n.chainLogo, alt: '' }) : null, n.chainName)),
        kv(t('nftId'), id),
        n.floor ? kv(t('nftFloor'), `${n.floor.price.toLocaleString(LOCALE, { maximumFractionDigits: 4 })} ${n.floor.currency} · ${n.floor.source}`) : null,
      ),
      h('p', { class: 'small muted' }, t('nftReadOnly')),
      n.explorer ? h('a', { class: 'btn secondary', href: n.explorer, target: '_blank', rel: 'noopener noreferrer' }, glyph('arrowUpRight', 18), t('viewExplorer')) : null,
    );
  }

  function nftList() {
    if (!nfts) return h('div', { 'data-testid': 'nfts' }, nftsLoading ? h('span', { class: 'sr' }, t('refreshing')) : null, skeleton(2));
    return h(
      'div',
      { class: 'stack', style: 'gap:12px', 'data-testid': 'nfts' },
      !!nfts.failed.length && h('div', { class: 'banner warn' }, glyph('alert', 16), h('span', { class: 'grow' }, t('nftDown', { list: names(nfts.failed) }))),
      nftsLoading && h('p', { class: 'small muted' }, t('refreshing')),
      !nfts.items.length && !nftsLoading && !nfts.failed.length && h('p', { class: 'empty' }, t('nftEmpty')),
      nfts.items.length > 0 &&
        h(
          'div',
          { class: 'nft-grid' },
          ...nfts.items.map((n) =>
            h(
              'button',
              { class: 'nft-card card', type: 'button', title: n.name, on: { click: () => nftSheet(n) } },
              h('span', { class: 'nft-frame' }, nftImage(n, 'nft-img'), n.chainLogo ? h('img', { class: 'badge', src: n.chainLogo, alt: '' }) : null),
              h('strong', { class: 'ellipsis' }, n.name),
              h('span', { class: 'small muted ellipsis' }, n.collection || n.chainName),
            ),
          ),
        ),
      h('p', { class: 'small muted note' }, t('nftNote')),
    );
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
    return h('button', { class: 'row link-row', type: 'button', 'data-testid': 'tx-row', on: { click: () => void txSheet(r) } }, ...inner);
  }

  /** Détail d'une transaction : état, date, réseau, expéditeur, destinataire (avec le contact), hash. */
  async function txSheet(r: ActivityRow) {
    const contacts = await loadContacts();
    const { a } = current();
    const own = [a?.evm, a?.solana].filter((x): x is string => !!x);
    const isOwn = (x: string) => own.some((o) => (o.startsWith('0x') ? o.toLowerCase() === x.toLowerCase() : o === x));
    const other = r.direction === 'in' ? r.from : r.to;
    const known = contacts.some((c) => (c.address.startsWith('0x') ? c.address.toLowerCase() === other.toLowerCase() : c.address === other));
    const kv = (k: string, v: Node | string) => h('div', { class: 'kv-row' }, h('span', { class: 'muted' }, k), typeof v === 'string' ? h('strong', {}, v) : v);
    const status = r.pending ? t('pending') : r.failed ? t('failedTx') : t('txConfirmed');
    const copyLabel = h('span', {}, t('copy'));
    const copy = h(
      'button',
      {
        class: 'chip copy',
        type: 'button',
        'data-testid': 'tx-copy-hash',
        on: {
          click: async () => {
            await navigator.clipboard.writeText(r.hash);
            copy.dataset.copied = '1';
            copyLabel.textContent = t('copied');
            setTimeout(() => (delete copy.dataset.copied, (copyLabel.textContent = t('copy'))), 1400);
          },
        },
      },
      glyph('copy', 14),
      copyLabel,
    );
    const when = r.timestamp ? new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' }).format(r.timestamp * 1000) : '—';
    const sheet = openSheet(
      r.label,
      h(
        'section',
        { class: 'tx-hero', 'data-testid': 'tx-detail' },
        r.amount ? h('p', { class: `token-value ${r.tone === 'up' ? 'up' : ''}` }, r.amount) : null,
        r.fiat ? h('p', { class: 'small muted' }, r.fiat) : null,
        h('p', { class: `pill ${r.failed ? 'loss' : r.pending ? 'quiet' : 'gain'}` }, glyph(r.failed ? 'errorCircle' : r.pending ? 'clock' : 'check', 14), status),
      ),
      h(
        'div',
        { class: 'card kv-card' },
        kv(t('txDate'), when),
        kv(t('tdNetwork'), h('span', { class: 'net' }, r.chainLogo ? h('img', { src: r.chainLogo, alt: '' }) : null, r.chainName)),
        r.from ? kv(t('from'), addressWithContact(r.from, contacts)) : null,
        r.to ? kv(t('to'), addressWithContact(r.to, contacts)) : null,
        kv(t('txHash'), h('span', { class: 'acct-line' }, h('span', { class: 'mono small' }, r.hash.length > 16 ? `${r.hash.slice(0, 8)}…${r.hash.slice(-6)}` : r.hash), copy)),
      ),
      r.subtitle ? h('p', { class: 'small muted' }, r.subtitle) : null,
      h(
        'div',
        { class: 'actions' },
        r.explorer ? h('a', { class: 'btn secondary', href: r.explorer, target: '_blank', rel: 'noopener noreferrer' }, glyph('arrowUpRight', 18), t('viewExplorer')) : null,
        other && !known && !isOwn(other) ? h('button', { class: 'btn secondary', type: 'button', 'data-testid': 'tx-save-contact', on: { click: () => (sheet.close(), contactSheet(null, () => {}, other)) } }, glyph('add', 18), t('ctAdd')) : null,
      ),
    );
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
  let shownTab: 'tokens' | 'nfts' | 'activity' = tab;
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
              if (id === 'nfts') void loadNfts(false);
            },
          },
        },
        label,
      );
    const idx = (x: typeof tab) => (x === 'tokens' ? 0 : x === 'nfts' ? 1 : 2);
    const el = h('div', { class: 'tabs', role: 'tablist', style: `--n:3;--i:${idx(shownTab)}` }, b('tokens', t('tabTokens')), b('nfts', t('tabNfts')), b('activity', t('tabActivity')));
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
    const pane = h('div', { class: 'pane' }, tab === 'tokens' ? tokens() : tab === 'nfts' ? nftList() : activityList());
    const sheet = h('section', { class: 'sheet' }, banners(), tabs(), pane);
    const root = h('div', { class: `home${opts.mode === 'popup' ? ' compact' : ''}${entered ? '' : ' enter'}` }, hero, sheet);
    entered = true;
    app.replaceChildren(root);
    if (back) navIn(app, 'back');
    // Cascade : seulement quand de vraies lignes arrivent (pas les squelettes, pas une actualisation).
    const rows = pane.querySelectorAll('.list:not([aria-hidden]) > .row, .day, .nft-card');
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
    const group = (title: string, ...rows: (Node | false)[]) => h('section', { class: 'group' }, h('p', { class: 'group-title' }, title), h('div', { class: 'list card' }, ...rows.filter((r): r is Node => !!r)));
    app.replaceChildren(
      h(
        'div',
        { class: 'screen settings enter' },
        h('header', { class: 'bar' }, h('button', { class: 'link', type: 'button', on: { click: () => render() } }, glyph('back', 18), t('back'))),
        h('h1', {}, t('settings')),
        group(t('setGeneral'), !!current().w && item('wallet', t('manageWallet'), null, () => manage(), 'manage-wallet'), item('currency', t('currency'), fiat), item('wallet', t('ctTitle'), null, () => (contactsScreen(app, () => settings('back')), navIn(app, 'fwd')), 'settings-contacts'), item('dapps', t('netTitle'), null, () => (networksScreen(app, () => settings('back')), navIn(app, 'fwd')), 'settings-networks'), item('clock', t('autoLock'), lock), item('add', t('addWallet'), null, () => void openOnboardingTab()), item('scan', t('compLinkMore'), null, () => void openOnboarding(opts.mode === 'popup', '#companion'))),
        group(
          t('setSecurity'),
          askPw,
          item('lock', t('pwChange'), null, () => changePasswordSheet(), 'change-password'),
          item('import', t('bkExport'), null, () => exportBackupSheet(), 'export-backup'),
          item('dapps', t('sitesTitle'), null, () => (void sitesScreen(app, () => settings('back')), navIn(app, 'fwd'))),
          item('check', t('wlTitle'), null, () => (whitelistScreen(app, () => settings('back')), navIn(app, 'fwd'))),
          // Autorisations de tokens : pour un compte qui a une adresse EVM.
          !!current().a?.evm && item('sign', t('apprTitle'), null, () => (allowancesScreen(app, () => settings('back')), navIn(app, 'fwd')), 'allowances'),
          // Phrase de récupération (portefeuille à phrase) : mot de passe redemandé, liste blanche respectée.
          current().w?.kind === 'seed' && item('phrase', t('showPhrase'), null, () => void openPhrase(), 'show-phrase'),
          // Téléphone relié (mode compagnon) : couper le lien.
          current().w?.kind === 'companion' && item('close', t('compUnlink'), null, () => unlinkPhone(), 'unlink-phone'),
        ),
        group(t('setHelp'), item('support', t('reportIssue'), null, () => void reportIssue(), 'report')),
        h('p', { class: 'small muted note' }, t('reportNote')),
        h('p', { class: 'small muted note' }, `${t('version', { v: VERSION })} · ${t('beta')}`),
      ),
    );
  }

  const openOnboardingTab = () => openOnboarding(opts.mode === 'popup');

  /** Gérer le portefeuille affiché : renommer, comptes, clé privée, suppression. */
  function manage() {
    const { w } = current();
    if (!w) return;
    navIn(app, 'fwd');
    manageWalletScreen(app, () => settings('back'), w, {
      // Relit les données sans redessiner l'accueil (on reste sur cet écran).
      changed: async () => {
        const r = await send<HomeData>({ type: 'home:get' }).catch(() => null);
        if (r?.ok && r.status.unlocked) data = r;
        return data?.wallets?.find((x) => x.id === w.id);
      },
      openPhrase: () => void openPhrase(),
      removed: () => {
        activity = null;
        nfts = null;
        shownTotal = null;
        void load();
      },
    });
  }

  /** Voir (et revérifier) la phrase : dans l'onglet d'installation, après le mot de passe. */
  async function openPhrase() {
    const { w } = current();
    if (!w) return;
    await browser.tabs.create({ url: browser.runtime.getURL(`/onboarding.html#verify=${encodeURIComponent(w.id)}`) });
    if (opts.mode === 'popup') window.close();
  }

  /** Délier le téléphone : confirmation, puis le portefeuille du téléphone disparaît de l'extension. */
  function unlinkPhone() {
    const { w } = current();
    if (!w || w.kind !== 'companion') return;
    const err = h('p', { class: 'error', role: 'alert' });
    const go = h('button', { class: 'btn danger', type: 'button', 'data-testid': 'unlink-confirm' }, t('compUnlink'));
    const sheet = openSheet(t('compUnlink'), h('p', {}, t('compUnlinkConfirm')), err, go);
    go.addEventListener('click', async () => {
      go.disabled = true;
      const r = await send({ type: 'companion:unlink', id: w.id });
      if (!r.ok) return void ((go.disabled = false), (err.textContent = errorText(r.error)));
      sheet.close();
      activity = null;
      nfts = null;
      shownTotal = null;
      await load();
      render();
    });
  }

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
