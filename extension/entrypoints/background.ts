import { isOwnExtensionPage } from '../lib/internal';
import { lockSessionToExtension, makeStore } from '../lib/storage';
import { makeSession, AUTO_LOCK_ALARM } from '../lib/session';
import { handleInternal } from '../lib/router';
import { makeWallets } from '../lib/wallets';

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

  const wallets = makeWallets(makeStore(browser.storage.local), session);

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
    handleInternal(session, wallets, msg).then(reply);
    return true; // réponse asynchrone
  });
});
