import { isOwnExtensionPage } from '../lib/internal';
import { lockSessionToExtension, makeStore } from '../lib/storage';
import { makeSession, AUTO_LOCK_ALARM } from '../lib/session';
import { idbWrapStore, KEYBOX_DB, makeKeyBox } from '../lib/keyBox';
import { handleInternal } from '../lib/router';
import { makeWallets } from '../lib/wallets';
import { makePortfolio } from '../lib/portfolio';
import { makeHome } from '../lib/home';
import { makeAssets } from '../lib/assets';
import { makeNfts } from '../lib/nfts';
import { makeContacts } from '../lib/contacts';
import { makeSwap } from '../lib/swap';
import { activityT, defaultFiat, explainT, explainTFor, LANG_KEY, LOCALE, setLang, t } from '../ui/i18n';
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
import { makeDappHost, registeredMatches, registerInpage } from '../lib/dappHost';
import { makeSiteAccess } from '../lib/siteAccess';
import { makeProfiledStore } from '../lib/profile';
import { makeSpendCap } from '../lib/spendCap';
import { makeGrants } from '../lib/grants';

/**
 * Service worker : le cerveau de l'extension, seul à toucher au coffre.
 *
 * Verrouillage : délai d'inactivité (alarme), écran de l'ordinateur verrouillé,
 * fermeture du navigateur (la zone session est vidée par Chrome).
 */
export default defineBackground(() => {
  // La zone session (clé du coffre) n'est jamais lisible par une page web.
  void lockSessionToExtension(browser.storage.session as never).catch(() => {});

  const rawDisk = makeStore(browser.storage.local);
  const sessionArea = makeStore(browser.storage.session);
  const session = makeSession({
    disk: rawDisk,
    session: sessionArea,
    alarms: browser.alarms,
    box: makeKeyBox(idbWrapStore()),
    purge: async (prefix) => {
      const keys = Object.keys(await browser.storage.local.get(null)).filter((k) => k.startsWith(prefix));
      if (keys.length) await browser.storage.local.remove(keys);
    },
  });

  // Données des modules : celles du profil ouvert (le vrai, ou le leurre du code de contrainte).
  const disk = makeProfiledStore(rawDisk, sessionArea);
  // Langue choisie dans les réglages (notifications, phrases d'activité, explications des signatures).
  void disk.get<string>('lang').then(setLang).catch(() => {});
  const wallets = makeWallets(disk, session);
  const assets = makeAssets({ disk });
  const portfolio = makePortfolio({
    disk,
    t: activityT,
    // Lue à chaque usage : suit un changement de langue sans redémarrer.
    get locale() {
      return LOCALE;
    },
    assets,
  });
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
    // Par profil : une transaction du vrai profil ne se signale jamais dans le leurre.
    store: makeProfiledStore(sessionArea, sessionArea),
    check: (w) => send.check(w),
    notify: (outcome, w) =>
      void browser.notifications
        .create(w.txid, { type: 'basic', iconUrl: browser.runtime.getURL('/icon/128.png'), title: t(outcome === 'confirmed' ? 'notifConfirmed' : 'notifFailed'), message: `${w.what} · ${w.chainName}` })
        .catch(() => {}),
    schedule: (on) => void (on ? browser.alarms.create(TX_ALARM, { periodInMinutes: 0.5 }) : browser.alarms.clear(TX_ALARM)).catch(() => {}),
  });
  // Plafond journalier et rappels d'autorisations (par profil, comme le reste).
  const cap = makeSpendCap({ disk });
  const grants = makeGrants({ disk });
  const GRANTS_ALARM = 'kalyx-grants';
  const GRANTS_NOTIF = 'kalyx-grants';
  void browser.alarms.get(GRANTS_ALARM).then(async (a) => void (a || (await browser.alarms.create(GRANTS_ALARM, { periodInMinutes: 30 })))).catch(() => {});
  const remindGrants = async () => {
    const due = await grants.takeDue();
    if (!due.length) return;
    const list = due.slice(0, 3).map((g) => `${g.symbol} · ${new URL(g.origin).host}`).join(', ');
    await browser.notifications.create(GRANTS_NOTIF, { type: 'basic', iconUrl: browser.runtime.getURL('/icon/128.png'), title: t('grNotifTitle', { n: due.length }), message: t('grNotifBody', { list }) }).catch(() => {});
  };
  browser.notifications.onClicked.addListener((nid) => {
    // Rappel d'autorisations : l'écran des autorisations, dans un onglet (le popup ne s'ouvre pas par programme).
    if (nid === GRANTS_NOTIF) return void browser.tabs.create({ url: browser.runtime.getURL('/sidepanel.html#allowances') }).then(() => browser.notifications.clear(nid)).catch(() => {});
    void txWatch.explorerOf(nid).then((url) => {
      if (url && /^https:\/\//.test(url)) void browser.tabs.create({ url });
    });
    void browser.notifications.clear(nid).catch(() => {});
  });
  const swap = makeSwap({ home, portfolio, execute: { session, wallets, companion }, onSent: (w) => void txWatch.add(w) });
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
  // Présence sur les sites : partout, ou sites autorisés seulement (réglage).
  const siteAccess = makeSiteAccess({
    disk,
    connected: async () => (await sites.list()).map((x) => x.origin),
    register: async (matches) => registerInpage((await disk.get<boolean>('defaultProvider')) === true, matches),
  });
  const host = makeDappHost(() => dapp, (origin) => approvals.originGone(origin));
  const dapp = makeDapp({
    session,
    wallets,
    sites,
    approvals,
    emit: host.emit,
    t: explainT,
    tFor: explainTFor,
    dappAllowed: () => whitelist.dappAllowed(),
    executeDeps: { companion },
    reviewDeps: {
      // Score de risque : site connecté depuis plus de 24 h ? signes d'une page altérée ?
      // Plafond journalier : prix du dernier cliché du compte affiché (aucune requête de plus).
      priceOf: async (chainId, contract) => {
        const cur = await home.current();
        if (!cur) return null;
        const hs = await portfolio.holdings(cur.acct, await home.fiat());
        const h = hs.find((x) => x.chainId === chainId && (contract ? x.contract?.toLowerCase() === contract.toLowerCase() : x.kind === 'native'));
        return h && h.price > 0 ? h.price : null;
      },
      site: async (origin) => {
        const s = await sites.get(origin);
        const since = Math.min(...[s.evm?.at, s.solana?.at].filter((x): x is number => typeof x === 'number'));
        return { known: Number.isFinite(since) && Date.now() - since > 86_400_000, tampered: host.tamperOf(origin) };
      },
    },
  });
  browser.runtime.onConnect.addListener((port) => host.accept(port));
  browser.windows.onRemoved.addListener((windowId) => approvals.windowClosed(windowId));
  // Verrouillage / déverrouillage (la clé de session apparaît ou disparaît) : les sites connectés suivent.
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && 'kalyx.vaultKey' in changes) void dapp.lockChanged(host.origins());
    if (area === 'local' && LANG_KEY in changes) setLang(changes[LANG_KEY].newValue as string | undefined);
  });

  /*
   * Mot de passe oublié : TOUT est effacé (coffre, réglages, sites, carnet,
   * liens avec le téléphone), sauf la langue, SANS redémarrer l'extension
   * (runtime.reload peut la laisser désactivée). Ce que le service worker
   * garde en mémoire est inutilisable sans coffre ; les sites connectés sont
   * prévenus et leurs demandes en attente refusées.
   */
  const reset = async () => {
    for (const origin of host.origins()) {
      approvals.originGone(origin);
      await dapp.disconnect(origin).catch(() => {});
    }
    await session.lock().catch(() => {});
    // Liens avec le téléphone : fermés de son côté (WalletConnect efface alors ses sessions).
    if (((await indexedDB.databases?.().catch(() => [])) ?? []).some((d) => d.name !== KEYBOX_DB)) await companion.unlinkAll();
    const lang = (await browser.storage.local.get(LANG_KEY))[LANG_KEY];
    await browser.alarms.clearAll();
    await browser.storage.session.clear();
    await browser.storage.local.clear();
    if (typeof lang === 'string') await browser.storage.local.set({ [LANG_KEY]: lang });
    // Une actualisation déjà en vol a pu réécrire son cache (soldes, activité, NFT : données publiques) : second passage sur ces caches seulement.
    setTimeout(async () => {
      const keys = Object.keys(await browser.storage.local.get(null)).filter((k) => /^kalyx\.(portfolio|activity|custom|nfts)\./.test(k));
      if (keys.length) await browser.storage.local.remove(keys);
    }, 5_000);
    void browser.action.setBadgeText({ text: '' }).catch(() => {});
    // « Kalyx par défaut » et la présence sur les sites reviennent à leur valeur de départ.
    await siteAccess.apply().catch(() => {});
  };
  const ensureInpage = async () => {
    const want = await siteAccess.matches();
    if ((await registeredMatches())?.join() !== [...want].sort().join()) await siteAccess.apply();
  };
  void ensureInpage().catch(() => {});

  // Installation : l'onboarding s'ouvre dans un ONGLET complet (un popup se ferme au moindre clic à côté).
  browser.runtime.onInstalled.addListener((d) => {
    if (d.reason === 'install') void browser.tabs.create({ url: browser.runtime.getURL('/onboarding.html') });
    // Installation ou mise à jour : le script de page est réenregistré dans sa version courante.
    void siteAccess.apply().catch(() => {});
  });

  browser.alarms.onAlarm.addListener((a) => {
    if (a.name === AUTO_LOCK_ALARM) void session.lock();
    if (a.name === TX_ALARM) void txWatch.tick();
    if (a.name === GRANTS_ALARM) void remindGrants().catch(() => {});
  });
  /*
   * Mode parano : verrouillé aussi après 1 min sans activité de l'ordinateur
   * (au lieu de l'écran verrouillé seulement) et dès que Chrome perd le focus
   * (autre application au premier plan). 1,5 s de grâce : passer d'une
   * fenêtre Chrome à une autre fait brièvement « aucune fenêtre ».
   */
  browser.idle.setDetectionInterval(60);
  browser.idle.onStateChanged.addListener((state) => {
    if (state === 'locked') void session.lock();
    else if (state === 'idle') void session.paranoid().then(async (on) => void (on && (await session.lock())));
  });
  let blur: ReturnType<typeof setTimeout> | undefined;
  browser.windows.onFocusChanged.addListener((id) => {
    clearTimeout(blur);
    if (id !== browser.windows.WINDOW_ID_NONE) return;
    blur = setTimeout(async () => {
      if (!(await session.paranoid())) return;
      const focused = (await browser.windows.getAll().catch(() => [])).some((w) => w.focused);
      if (!focused) await session.lock();
    }, 1500);
  });

  browser.runtime.onMessage.addListener((msg: unknown, sender, reply) => {
    if (!isOwnExtensionPage(sender, browser.runtime.id)) return false;
    handleInternal(session, wallets, msg, undefined, { home, send, whitelist, disk, sites, approvals, dapp, companion, buy, siteIcon, allowances, txWatch, assets, nfts, contacts, swap, reset, siteAccess, cap, grants, setDefault: async (on: boolean) => (await disk.set('defaultProvider', on), await siteAccess.apply()) }).then(reply);
    return true; // réponse asynchrone
  });
});
