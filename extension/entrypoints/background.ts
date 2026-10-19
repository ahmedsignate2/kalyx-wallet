import { isOwnExtensionPage } from '../lib/internal';
import { lockSessionToExtension, makeStore } from '../lib/storage';
import { makeSession, AUTO_LOCK_ALARM } from '../lib/session';
import { handleInternal } from '../lib/router';
import { makeWallets } from '../lib/wallets';
import { makePortfolio } from '../lib/portfolio';
import { makeHome } from '../lib/home';
import { activityT, IS_FR, LOCALE } from '../ui/i18n';
import { makeChainTime } from '../lib/chainTime';
import { makeWhitelist } from '../lib/whitelist';
import { makeSend } from '../lib/send';
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
  const portfolio = makePortfolio({ disk, t: activityT, locale: LOCALE });
  const home = makeHome(disk, session, wallets, portfolio, IS_FR ? 'eur' : 'usd');
  const whitelist = makeWhitelist(disk, session, wallets, makeChainTime());
  const send = makeSend({ session, home, portfolio, whitelist });

  // ── Pont vers les dApps ──
  const sites = makeSites(disk);
  const approvals = makeApprovals({
    open: async (id) =>
      (await browser.windows.create({ url: browser.runtime.getURL(`/approval.html#${id}`), type: 'popup', width: 380, height: 640, focused: true }))?.id,
    close: async (windowId) => void (await browser.windows.remove(windowId).catch(() => {})),
  });
  const host = makeDappHost(() => dapp, (origin) => approvals.originGone(origin));
  const dapp = makeDapp({ session, wallets, sites, approvals, emit: host.emit });
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
  });
  browser.idle.onStateChanged.addListener((state) => {
    if (state === 'locked') void session.lock();
  });

  browser.runtime.onMessage.addListener((msg: unknown, sender, reply) => {
    if (!isOwnExtensionPage(sender, browser.runtime.id)) return false;
    handleInternal(session, wallets, msg, undefined, { home, send, whitelist, disk, sites, approvals, dapp, setDefault: async (on: boolean) => (await disk.set('defaultProvider', on), await registerInpage(on)) }).then(reply);
    return true; // réponse asynchrone
  });
});
