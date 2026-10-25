/**
 * WEBAPP : le « cerveau » de l'extension, dans la page (pas de service worker).
 *
 * Les MÊMES modules que l'extension (portefeuilles du téléphone, soldes,
 * activité, NFT, envoi, swap, autorisations, contacts…) avec le MÊME routeur :
 * l'interface ne voit aucune différence. Ce qui change :
 *  - Téléphone seul, toujours : aucune clé n'existe sur le web ; créer ou
 *    importer un portefeuille est refusé par le routeur (PHONE_ONLY).
 *  - Aucun mot de passe : le coffre local ne contient que les adresses
 *    publiques reçues du téléphone ; il est fermé par une clé aléatoire gardée
 *    dans ce navigateur. Chaque envoi, swap ou révocation se valide sur le
 *    téléphone (PIN ou biométrie).
 *  - Pas de pont vers les sites (dApps) : c'est le rôle de l'extension.
 */
import { makeStore } from '../lib/storage';
import { makeSession } from '../lib/session';
import { handleInternal, type Reply } from '../lib/router';
import { makeWallets } from '../lib/wallets';
import { makePortfolio } from '../lib/portfolio';
import { makeHome } from '../lib/home';
import { makeAssets } from '../lib/assets';
import { makeNfts } from '../lib/nfts';
import { makeContacts } from '../lib/contacts';
import { makeSwap } from '../lib/swap';
import { activityT, defaultFiat, LOCALE, setLang } from '../ui/i18n';
import { makeTxWatch } from '../lib/txWatch';
import { makeAllowances } from '../lib/allowances';
import { makeChainTime } from '../lib/chainTime';
import { makeWhitelist } from '../lib/whitelist';
import { makeSend } from '../lib/send';
import { makeCompanion } from '../lib/companion';
import { makeBuy } from '../lib/buy';
import { makeProfiledStore } from '../lib/profile';
import { makeSpendCap } from '../lib/spendCap';
import { makeGrants } from '../lib/grants';

declare const __KALYX_WEB_TEST__: boolean;

/** Le coffre ne garde que des adresses publiques et la clé est aléatoire : scrypt léger suffit. */
const WEB_KDF = { N: 1 << 12, r: 8, p: 1 };
/** Clé du coffre local (aléatoire, propre à ce navigateur). */
const KEY_ITEM = 'kalyx.web.vaultKey';
/** Identité annoncée au téléphone : l'app la montre telle quelle dans ses connexions. */
export const WEB_METADATA = {
  name: 'Kalyx — web',
  description: 'Tableau de bord web Kalyx : les clés restent sur le téléphone.',
  url: 'https://app.kalyxwallet.com',
  icons: ['https://kalyxwallet.com/icon.png'],
};

function randomKey(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  // Base64url + quelques signes : largement au-dessus de la règle de force (elle vise les mots de passe humains).
  return `Kx-${btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}!7`;
}

function readKey(): string | null {
  try {
    return localStorage.getItem(KEY_ITEM);
  } catch {
    return null;
  }
}

export function makeWebHost() {
  const rawDisk = makeStore(browser.storage.local);
  const sessionArea = makeStore(browser.storage.session);
  const session = makeSession({
    disk: rawDisk,
    session: sessionArea,
    alarms: browser.alarms,
    kdf: WEB_KDF,
    purge: async (prefix) => {
      const keys = Object.keys(await browser.storage.local.get(null)).filter((k) => k.startsWith(prefix));
      if (keys.length) await browser.storage.local.remove(keys);
    },
  });
  const disk = makeProfiledStore(rawDisk, sessionArea);
  void disk.get<string>('lang').then(setLang).catch(() => {});
  const wallets = makeWallets(disk, session);
  const assets = makeAssets({ disk });
  const portfolio = makePortfolio({
    disk,
    t: activityT,
    get locale() {
      return LOCALE;
    },
    assets,
  });
  const nfts = makeNfts({ disk, hiddenChains: async () => (await assets.prefs()).hiddenChains });
  const home = makeHome(disk, session, wallets, portfolio, defaultFiat());
  const contacts = makeContacts(disk, session);
  const whitelist = makeWhitelist(disk, session, wallets, makeChainTime());
  const companion = makeCompanion(wallets, { metadata: WEB_METADATA });
  const buy = makeBuy(home);
  const allowances = makeAllowances({ home, execute: { session, wallets, companion }, holdings: async (acct) => portfolio.holdings(acct, await home.fiat()), fiat: () => home.fiat() });
  const TX_ALARM = 'kalyx-txwatch';
  const txWatch = makeTxWatch({
    store: makeProfiledStore(sessionArea, sessionArea),
    check: (w) => send.check(w),
    // Pas de notification système ici : l'activité se met à jour à l'écran.
    notify: () => {},
    schedule: (on) => void (on ? browser.alarms.create(TX_ALARM, { periodInMinutes: 0.5 }) : browser.alarms.clear(TX_ALARM)).catch(() => {}),
  });
  const cap = makeSpendCap({ disk });
  const grants = makeGrants({ disk });
  const swap = makeSwap({ home, portfolio, execute: { session, wallets, companion }, onSent: (w) => void txWatch.add(w) });
  const send = makeSend({ session, wallets, home, portfolio, whitelist, companion, onSent: (w) => void txWatch.add(w) });

  browser.alarms.onAlarm.addListener((a) => {
    if (a.name === TX_ALARM) void txWatch.tick();
  });

  /** Tout effacer : liaisons fermées côté téléphone (au mieux), puis données de ce navigateur. */
  const reset = async () => {
    await companion.unlinkAll().catch(() => {});
    await browser.alarms.clearAll();
    await browser.storage.session.clear();
    await browser.storage.local.clear();
    try {
      localStorage.removeItem(KEY_ITEM);
    } catch {
      /* stockage bloqué */
    }
  };

  const services = { home, send, whitelist, disk, companion, buy, allowances, txWatch, assets, nfts, contacts, swap, reset, cap, grants };
  const handle = (msg: unknown): Promise<Reply> => handleInternal(session, wallets, msg, undefined, services);

  /**
   * Coffre local prêt et ouvert, sans rien demander : créé à la première
   * visite (téléphone seul, mot de passe jamais redemandé), rouvert ensuite
   * avec la clé de ce navigateur. Clé perdue (stockage effacé à moitié) : on repart de zéro.
   */
  async function ready(): Promise<void> {
    const st = await session.status();
    let key = readKey();
    if (st.hasVault && st.unlocked) return;
    if (st.hasVault) {
      try {
        if (!key) throw new Error('clé absente');
        await session.unlock(key);
        return;
      } catch {
        // Clé effacée ou illisible : le coffre ne s'ouvrira plus, on repart de zéro (il ne contenait que des adresses).
        await reset();
      }
    }
    key = randomKey();
    localStorage.setItem(KEY_ITEM, key);
    await session.create(key);
    await disk.set('phoneOnly', true);
    await disk.set('askPasswordToSign', false);
  }

  return {
    handle,
    ready,
    reset,
    heartbeat: () => companion.heartbeat(),
    // Build de test seulement (web/smoke.mjs) : un téléphone « relié » sans relais. Absent du build publié.
    ...(__KALYX_WEB_TEST__ ? { testLink: (p: Parameters<typeof wallets.addCompanion>[0]) => wallets.addCompanion(p) } : {}),
  };
}
