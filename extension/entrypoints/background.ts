import { isOwnExtensionPage } from '../lib/internal';
import { lockSessionToExtension, makeStore } from '../lib/storage';
import { makeSession, AUTO_LOCK_ALARM } from '../lib/session';
import { handleInternal } from '../lib/router';
import { makeWallets } from '../lib/wallets';
import { makePortfolio } from '../lib/portfolio';
import { makeHome } from '../lib/home';
import { makeAssets } from '../lib/assets';
import { makeNfts } from '../lib/nfts';
import { makeContacts } from '../lib/contacts';
import { activityT, defaultFiat, explainT, explainTFor, LOCALE, t } from '../ui/i18n';
import { makeTxWatch } from '../lib/txWatch';
import { makeAllowances } from '../lib/allowances';
import { makeChainTime } from '../lib/chainTime';
import { makeWhitelist } from '../lib/whitelist';
import { makeSend } from '../lib/send';
import { makeCompanion } from '../lib/companion';
import { makeBuy } from '../lib/buy';
import { safeIcon } from '../lib/siteInfo';
import { makeSites } from '../lib/sites';
import { makeApprovals } from '../lib/approvals';
import { makeDapp } from '../lib/dapp';
import { inpageRegistered, makeDappHost, registerInpage } from '../lib/dappHost';

/**
 * Service worker : le cerveau de l'extension, seul à toucher au coffre.
 *
 * Verrouillage : délai d'inactivité (alarme), écran de l'ordinateur verrouillé,
 * fermeture du navigateur (la zone session est vidée par Chrome).
 */
export default defineBackground(() => {
  // La zone session (clé du coffre) n'est jamais lisible par une page web.
  void lockSessionToExtension(browser.storage.session as never).catch(() => {});

  const session = makeSession({
    disk: makeStore(browser.storage.local),
    session: makeStore(browser.storage.session),
    alarms: browser.alarms,
  });

  const disk = makeStore(browser.storage.local);
  const wallets = makeWallets(disk, session);
  const assets = makeAssets({ disk });
  const portfolio = makePortfolio({ disk, t: activityT, locale: LOCALE, assets });
  const nfts = makeNfts({ disk, hiddenChains: async () => (await assets.prefs()).hiddenChains });
  const home = makeHome(disk, session, wallets, portfolio, defaultFiat());
  const contacts = makeContacts(disk, session);
  const whitelist = makeWhitelist(disk, session, wallets, makeChainTime());
  // Mode compagnon : un appel léger toutes les 20 s garde le worker éveillé pendant une validation sur le téléphone.
  const companion = makeCompanion(wallets, { keepAlive: () => void browser.runtime.getPlatformInfo().catch(() => {}) });
  const buy = makeBuy(home);
  const allowances = makeAllowances({ home, execute: { session, wallets, companion } });
  /** Icône d'un site : celle que Chrome a lue dans un onglet ouvert sur cette origine. */
  const siteIcon = async (origin: string) => {
    const tabs = await browser.tabs.query({});
    const tab = tabs.find((t) => {
      try {
        return !!t.url && new URL(t.url).origin === origin && !!t.favIconUrl;
      } catch {
        return false;
      }
    });
    return safeIcon(tab?.favIconUrl);
  };
  /*
   * Transactions suivies jusqu'à leur issue : UNE notification (confirmée ou
   * échouée), un clic ouvre l'explorateur. Alarme seulement tant qu'il y a
   * quelque chose à suivre.
   */
  const TX_ALARM = 'kalyx-txwatch';
  const txWatch = makeTxWatch({
    store: makeStore(browser.storage.session),
    check: (w) => send.check(w),
    notify: (outcome, w) =>
      void browser.notifications
        .create(w.txid, { type: 'basic', iconUrl: browser.runtime.getURL('/icon/128.png'), title: t(outcome === 'confirmed' ? 'notifConfirmed' : 'notifFailed'), message: `${w.what} · ${w.chainName}` })
        .catch(() => {}),
    schedule: (on) => void (on ? browser.alarms.create(TX_ALARM, { periodInMinutes: 0.5 }) : browser.alarms.clear(TX_ALARM)).catch(() => {}),
  });
  browser.notifications.onClicked.addListener((nid) => {
    void txWatch.explorerOf(nid).then((url) => {
      if (url && /^https:\/\//.test(url)) void browser.tabs.create({ url });
    });
    void browser.notifications.clear(nid).catch(() => {});
  });
  const send = makeSend({ session, wallets, home, portfolio, whitelist, companion, onSent: (w) => void txWatch.add(w) });

  // ── Pont vers les dApps ──
  const sites = makeSites(disk);
  const approvals = makeApprovals({
    // Demandes de sites en attente : leur nombre sur l'icône (sans notification de plus).
    onChange: (n) => {
      void browser.action.setBadgeText({ text: n ? String(n) : '' }).catch(() => {});
      void browser.action.setBadgeBackgroundColor({ color: '#E8743B' }).catch(() => {});
    },
    open: async (id) =>
      (await browser.windows.create({ url: browser.runtime.getURL(`/approval.html#${id}`), type: 'popup', width: 380, height: 640, focused: true }))?.id,
    close: async (windowId) => void (await browser.windows.remove(windowId).catch(() => {})),
  });
  const host = makeDappHost(() => dapp, (origin) => approvals.originGone(origin));
  const dapp = makeDapp({ session, wallets, sites, approvals, emit: host.emit, t: explainT, tFor: explainTFor, dappAllowed: () => whitelist.dappAllowed(), executeDeps: { companion } });
  browser.runtime.onConnect.addListener((port) => host.accept(port));
  browser.windows.onRemoved.addListener((windowId) => approvals.windowClosed(windowId));
  // Verrouillage / déverrouillage (la clé de session apparaît ou disparaît) : les sites connectés suivent.
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && 'kalyx.vaultKey' in changes) void dapp.lockChanged(host.origins());
  });
  const ensureInpage = async () => {
    if (!(await inpageRegistered())) await registerInpage((await disk.get<boolean>('defaultProvider')) === true);
  };
  void ensureInpage().catch(() => {});

  // Installation : l'onboarding s'ouvre dans un ONGLET complet (un popup se ferme au moindre clic à côté).
  browser.runtime.onInstalled.addListener((d) => {
    if (d.reason === 'install') void browser.tabs.create({ url: browser.runtime.getURL('/onboarding.html') });
    // Installation ou mise à jour : le script de page est réenregistré dans sa version courante.
    void (async () => registerInpage((await disk.get<boolean>('defaultProvider')) === true))().catch(() => {});
  });

  browser.alarms.onAlarm.addListener((a) => {
    if (a.name === AUTO_LOCK_ALARM) void session.lock();
    if (a.name === TX_ALARM) void txWatch.tick();
  });
  browser.idle.onStateChanged.addListener((state) => {
    if (state === 'locked') void session.lock();
  });

  browser.runtime.onMessage.addListener((msg: unknown, sender, reply) => {
    if (!isOwnExtensionPage(sender, browser.runtime.id)) return false;
    handleInternal(session, wallets, msg, undefined, { home, send, whitelist, disk, sites, approvals, dapp, companion, buy, siteIcon, allowances, txWatch, assets, nfts, contacts, setDefault: async (on: boolean) => (await disk.set('defaultProvider', on), await registerInpage(on)) }).then(reply);
    return true; // réponse asynchrone
  });
});
