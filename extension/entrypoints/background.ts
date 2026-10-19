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

  // Installation : l'onboarding s'ouvre dans un ONGLET complet (un popup se ferme au moindre clic à côté).
  browser.runtime.onInstalled.addListener((d) => {
    if (d.reason === 'install') void browser.tabs.create({ url: browser.runtime.getURL('/onboarding.html') });
  });

  browser.alarms.onAlarm.addListener((a) => {
    if (a.name === AUTO_LOCK_ALARM) void session.lock();
  });
  browser.idle.onStateChanged.addListener((state) => {
    if (state === 'locked') void session.lock();
  });

  browser.runtime.onMessage.addListener((msg: unknown, sender, reply) => {
    if (!isOwnExtensionPage(sender, browser.runtime.id)) return false;
    handleInternal(session, wallets, msg, undefined, { home, send, whitelist, disk }).then(reply);
    return true; // réponse asynchrone
  });
});
