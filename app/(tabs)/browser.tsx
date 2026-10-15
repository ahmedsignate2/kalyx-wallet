/**
 * Navigateur dApps Kalyx — « le site est la star, l'interface s'efface ».
 *
 *  - Barre d'adresse EN BAS (pilule 48, domaine principal en Lueur), qui se
 *    COMPACTE au scroll vers le bas et revient au scroll vers le haut. Un tap
 *    révèle l'URL éditable + suggestions (favoris/récents → dApps vérifiées →
 *    moteur au choix). Appui long = copier. À droite : glyphe du compte + chaîne.
 *  - UNE SEULE WebView montée (l'onglet actif) : les autres sont stockés en URL
 *    + titre et rechargés quand on y revient (Android tue sinon).
 *  - Comète de chargement, tirer pour recharger, onglets en grille (2 col.,
 *    rayon 22), onglet privé (rien de mémorisé), onglets restaurés au démarrage.
 *  - Le réseau SUIT le site : chaque onglet porte sa chaîne.
 *  - Sécurité : intent:// et schémas exotiques bloqués, APK = avertissement,
 *    popups bloquées, site dangereux = barre en Danger (seul moment où elle change),
 *    connexion/signature via SignSheet + biométrie unifiée.
 *  - Provider EIP-1193 injecté (window.ethereum) — plomberie inchangée.
 */
import { useIsWatchOnly } from '../../ui/WatchOnlyGate';
import { randomBytes } from '@noble/hashes/utils';
import { signMessageParam } from '../../lib/dappProvider';
import { buildTonJsBridge, parseTcJsMessage } from '../../src/domain/tonconnect/jsBridge';
import { useTonConnect, tcJsHost, tcDeviceInfo } from '../../lib/tonconnect/store';
import React, { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { fill, isPluralOne } from '../../lib/i18n';
import { View, TextInput, ScrollView, Share, Alert, useWindowDimensions, Linking, Platform, BackHandler } from 'react-native';
import { Stack, useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { Text, Button, IconButton, Divider, ListRow, Sheet, Chip, EmptyState, Input, Pressable as KPressable, Card, RemoteIcon, Switch, Checkbox } from '../../ui/kit';
import { Icon } from '../../ui/icon';
import { SignSheet } from '../../ui/SignSheet';
import { ConfirmUnlock } from '../../ui/ConfirmUnlock';
import { AddressBar, shieldLook } from '../../ui/browser/AddressBar';
import { useTabBar } from '../../ui/tabs';
import { Comet } from '../../ui/browser/Comet';
import { createTicker, useTicker } from '../../lib/ticker';
import { DappTile, DappLogo, siteName } from '../../ui/browser/DappTile';
import { useTheme } from '../../ui/theme';
import { space, SCREEN_MARGIN, radius, radii, springs, fontSize } from '../../ui/tokens';
import { Rise, TextTabs, ScreenDunes } from '../../ui/nova';
import { haptic } from '../../lib/haptics';
import { sound } from '../../lib/sound';
import { useWallet, type Unlock } from '../../lib/walletStore';
import { useTokenStore } from '../../lib/tokenStore';
import { useSettings, useT, useExplainT } from '../../lib/settingsStore';
import { toast } from '../../lib/toast';
import { loadRecents, pushRecent, clearRecents, loadFavorites, toggleFavorite, type RecentDapp } from '../../lib/recentDapps';
import { useDappActivity, knownSites } from '../../lib/dappActivity';
import { technicalLogger } from '../../lib/technicalLogger';
import { useBrowserStore } from '../../lib/browserStore';
import { saveTabs, loadTabs } from '../../lib/browserTabs';
import { useBrowserPresence } from '../../lib/browserPresence';
import { useWalletConnect } from '../../lib/walletconnect';
import { looksLikeTonConnect } from '../../src/domain/tonconnect/connectLink';
import { extractWcUri, isWcPairingUri } from '../../src/domain/qr/deeplink';
import { loadBrowserPrefs, saveEngine, saveForceDark, ENGINES, VERIFIED_DAPPS, type SearchEngine } from '../../lib/browserPrefs';
import { buildInjectedProvider, parseDappMessage, respondJs, emitJs, rpcProxy, RpcProxyError, READONLY_METHODS, type DappRequest } from '../../lib/dappProvider';
import { phishingSiteStatus, type PhishingVerdict } from '../../src/domain/security/goplus';
import { catalogEntry, dappCompat, isLookalike, lookalikeOf, siteShield, type DappCompat } from '../../src/domain/web/dappCatalog';
import {
  getAdapter,
  formatTokenAmount,
  listChains,
  hexToText,
  parseSiwe,
  siweDomainMismatch,
  summarizeTypedData,
  assessAddress,
  isPhishingSite,
  decodeTx,
  simulateTx,
  explainRequest,
  getTokenMetadata,
  chainIconUrl,
  isValidEvmAddress,
  type RawTxRequest,
  type RiskAssessment,
  type Simulation
} from '../../src';
import { useHistoryStore } from '../../lib/historyStore';
import { useKeyboardHeight } from '../../ui/useKeyboardHeight';
import { goBack } from '../../lib/nav';

// WebView = module natif : require dynamique pour ne pas crasher avant rebuild.
let WebViewComp: React.ComponentType<Record<string, unknown>> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  WebViewComp = require('react-native-webview').WebView;
} catch {
  WebViewComp = null;
}
type WV = { injectJavaScript: (js: string) => void; goBack: () => void; goForward: () => void; reload: () => void; stopLoading: () => void };

interface Tab {
  id: string;
  url: string | null;
  title: string;
  canBack: boolean;
  canFwd: boolean;
  incognito: boolean;
  chainId: string;
  desktop: boolean;
}
let tabSeq = 0;
function mkTab(chainId: string, url: string | null = null, incognito = false): Tab {
  return { id: `t${Date.now().toString(36)}${(tabSeq++).toString(36)}`, url, title: '', canBack: false, canFwd: false, incognito, chainId, desktop: false };
}

type Pending =
  | { kind: 'connect'; tabId: string; id: number; origin: string }
  | { kind: 'sign'; tabId: string; id: number; origin: string; text: string | null; siwe: ReturnType<typeof parseSiwe>; hex: string }
  | { kind: 'typedData'; tabId: string; id: number; origin: string; summary: ReturnType<typeof summarizeTypedData>; data: unknown; evmChainId: number }
  /** `chainId` : réseau Kalyx FIGÉ à la demande — celui du Chain ID signé dans `raw`. */
  | { kind: 'tx'; tabId: string; id: number; origin: string; to?: string; value: bigint; raw: RawTxRequest; chainId: string };

function originOf(url: string): string {
  const m = url.match(/^https:\/\/([^/]+)/i);
  return m ? m[1].toLowerCase() : '';
}
/** Domaines dApp reconnus (sosies → suspect). */
/** Hôtes du catalogue vérifié : seuls à recevoir la coche « vérifié » dans les demandes de signature. */
const VERIFIED_HOSTS = new Set(VERIFIED_DAPPS.flatMap((c) => c.items.map((d) => d.host)));

/* Sosies (« uniswapp.org ») : `isLookalike` vient du catalogue (src/domain/web/dappCatalog.ts), même règle qu'avant. */

/** Pastille de compatibilité d'une dApp du catalogue. */
const COMPAT_KEY: Record<DappCompat, string> = { evm: 'dappCompatEvm', ton: 'dappCompatTon', walletconnect: 'dappCompatWalletConnect' };

function normalizeUrl(raw?: string | null): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s || /\s/.test(s)) return null;
  if (/^https?:\/\//i.test(s)) return s.replace(/^http:\/\//i, 'https://');
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(s)) return `https://${s}`;
  return null;
}
const DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';

/** 128 bits aléatoires (générateur sécurisé), en hexadécimal. */
const isLoadingProgress = (v: number) => v > 0 && v < 1;

const connKey = (origin: string, incognito?: boolean) => (incognito ? `incognito:${origin}` : origin);

function bytesToHexToken(): string {
  return Array.from(randomBytes(16), (b) => b.toString(16).padStart(2, '0')).join('');
}

export default function Browser() {
  const t = useT();
  const language = useSettings((s) => s.language);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const kbHeight = useKeyboardHeight();
  const { width: screenW } = useWindowDimensions();
  const setBrowserContext = useBrowserStore((s) => s.setBrowserContext);
  const account = useWallet((s) => s.account);
  /*
   * Adresse EVM du compte actif : c'est elle que voient les dApps (fournisseur
   * `window.ethereum`) et elle qui signe. `account.address` suit le réseau
   * ACTIF de l'app : sur Solana, une dApp EVM recevait l'adresse Solana.
   */
  const evmAddress = useWallet((s) => s.accounts.find((a) => a.index === s.activeAccountIndex)?.evmAddress);
  /** Adresse SUIVIE (lecture seule) : jamais présentée à un site comme celle de l'utilisateur. */
  const watchOnly = useIsWatchOnly();
  /*
   * Connexions effacées ailleurs (réinitialisation, « effacer les données ») :
   * le navigateur reste monté et gardait ses sites connectés EN MÉMOIRE — la
   * page ouverte voyait encore le compte. On les oublie et on prévient la page.
   */
  const dappEpoch = useDappActivity((s) => s.epoch);
  const activeChain = useWallet((s) => s.activeChain);
  const setActiveChain = useWallet((s) => s.setActiveChain);
  const showTestnets = useSettings((s) => s.showTestnets);
  // Explications de signature dans la langue choisie (elles étaient en français pour tous).
  const exT = useExplainT();

  // ── Onglets (une seule WebView montée) ──
  const [tabs, setTabsState] = useState<Tab[]>(() => [mkTab(activeChain)]);
  const [activeId, setActiveIdState] = useState<string>(() => tabs[0].id);
  const tabsRef = useRef(tabs);
  const activeRef = useRef(activeId);
  const setTabs = (u: Tab[] | ((p: Tab[]) => Tab[])) => {
    const next = typeof u === 'function' ? (u as (p: Tab[]) => Tab[])(tabsRef.current) : u;
    tabsRef.current = next;
    setTabsState(next);
  };
  const setActiveId = (id: string) => {
    activeRef.current = id;
    setActiveIdState(id);
    const tb = tabsRef.current.find((x) => x.id === id);
    if (tb) {
      setBrowserContext({ currentUrl: tb.url || '', currentTitle: tb.title || '' });
      if (tb.chainId !== useWallet.getState().activeChain) setActiveChain(tb.chainId); // le réseau suit le site
    }
  };
  const updateTab = (id: string, patch: Partial<Tab>) => setTabs((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const webref = useRef<WV | null>(null);
  const activeTab = tabs.find((t) => t.id === activeId) ?? tabs[0];
  const origin = activeTab?.url ? originOf(activeTab.url) : '';
  const chain = getAdapter(activeTab?.chainId ?? activeChain).config;
  const chainIdHex = '0x' + (chain.evmChainId ?? 1).toString(16);

  // Progression hors état React : la comète s'y abonne, l'écran ne suit que « en cours ou non ».
  const [progress] = useState(() => createTicker(0));
  const pageLoading = useTicker(progress, isLoadingProgress);
  const [webError, setWebError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState('');
  const [switcher, setSwitcher] = useState(false);
  const [menu, setMenu] = useState(false);
  // Connexion par lien (WalletConnect / TON Connect) SANS quitter la page.
  const [linkSheet, setLinkSheet] = useState(false);
  const [linkText, setLinkText] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);
  // Revenir sur le navigateur = il n'est plus « de côté ».
  useFocusEffect(useCallback(() => { useBrowserPresence.getState().clear(); }, []));
  // Retour Android : page précédente, puis sortie vers l'accueil SANS fermer la page.
  const hardwareBack = useRef<() => boolean>(() => false);
  hardwareBack.current = () => {
    const tab = tabsRef.current.find((x) => x.id === activeRef.current);
    if (!tab?.url) return false;
    if (tab.canBack) webref.current?.goBack();
    else leaveBrowser();
    return true;
  };
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => hardwareBack.current());
      return () => sub.remove();
    }, []),
  );
  const [connSheet, setConnSheet] = useState(false);
  const [findSheet, setFindSheet] = useState(false);
  const [findQ, setFindQ] = useState('');
  const [netQ, setNetQ] = useState('');
  const [engine, setEngine] = useState<SearchEngine>('google');
  const [forceDark, setForceDark] = useState(false);
  const [category, setCategory] = useState(VERIFIED_DAPPS[0].category);
  const [recents, setRecents] = useState<RecentDapp[]>([]);
  const [favorites, setFavorites] = useState<RecentDapp[]>([]);
  const recentsRef = useRef<RecentDapp[]>([]);
  const favRef = useRef<RecentDapp[]>([]);
  const applyRecents = (l: RecentDapp[]) => { recentsRef.current = l; setRecents(l); };
  const applyFav = (l: RecentDapp[]) => { favRef.current = l; setFavorites(l); };
  /*
   * Verdict GoPlus par hôte, pour la session. `unknown` (GoPlus injoignable,
   * quota, réponse illisible) n'est PAS « sûr » : affiché « non analysé » et
   * retenté au prochain chargement de page — il était mémorisé comme sûr.
   */
  const [dangerHosts, setDangerHosts] = useState<Record<string, PhishingVerdict>>({});
  const dangerHostsRef = useRef(dangerHosts);
  dangerHostsRef.current = dangerHosts;
  const scanInFlight = useRef<Set<string>>(new Set());
  /** Incrémenté à chaque chargement de page : relance l'analyse d'un hôte resté « non analysé ». */
  const [loadSeq, setLoadSeq] = useState(0);
  const securityScan = useSettings((s) => s.securityScan);
  const [shieldSheet, setShieldSheet] = useState(false);
  // Sites signalés que l'utilisateur a choisi d'ouvrir malgré l'avertissement (cette session seulement).
  const [bypassedHosts, setBypassedHosts] = useState<ReadonlySet<string>>(() => new Set());
  const loadActivity = useDappActivity((s) => s.load);
  const connections = useDappActivity((s) => s.connections);
  const removeConnection = useDappActivity((s) => s.removeConnection);

  // Compaction de la barre au scroll (0 = pleine, 1 = compacte).
  const compact = useSharedValue(0);
  const lastY = useRef(0);
  const onWebScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    const y = e.nativeEvent.contentOffset.y;
    const dy = y - lastY.current;
    lastY.current = y;
    if (y < 40 || dy < -6) compact.value = withSpring(0, springs.standard);
    else if (dy > 6) compact.value = withTiming(1, { duration: 180 });
  }, [compact]);
  const chromeStyle = useAnimatedStyle(() => ({ opacity: 1 - compact.value * 0.15 }));

  const restoreSession = useEffectEvent(() => {
    loadRecents().then(applyRecents);
    loadFavorites().then(applyFav);
    loadActivity();
    loadBrowserPrefs().then((p) => { setEngine(p.engine); setForceDark(p.forceDark); });
    loadTabs().then((saved) => {
      if (!saved || saved.tabs.length === 0) return;
      const restored: Tab[] = saved.tabs.map((t) => ({ id: t.id, url: t.url, title: t.title, canBack: false, canFwd: false, incognito: false, chainId: t.chainId ?? activeChain, desktop: false }));
      setTabs(restored);
      setActiveId(restored.some((t) => t.id === saved.activeId) ? saved.activeId : restored[0].id);
    });
  });
  useEffect(() => {
    restoreSession();
  }, []);
  useEffect(() => {
    const h = setTimeout(() => saveTabs(tabs.filter((t) => !t.incognito).map((t) => ({ id: t.id, url: t.url, title: t.title, chainId: t.chainId })), activeId), 500);
    return () => clearTimeout(h);
  }, [tabs, activeId]);
  useEffect(() => {
    progress.set(0);
    setWebError(null);
    compact.value = 0;
    lastY.current = 0;
  }, [activeId, compact, progress]);

  // Deep-link : /browser?url=…
  /*
   * `chain` : réseau EVM sur lequel ouvrir CET onglet (l'onglet Carte ouvre son
   * émetteur sur le réseau de paiement choisi, sans changer celui de l'app).
   * `n` : jeton d'appel, pour qu'un second appel à la même URL soit pris en compte.
   */
  const { url: urlParam, chain: chainParam, n: navNonce } = useLocalSearchParams<{ url?: string; chain?: string; n?: string }>();
  // Barre d'onglets sur la page « nouvel onglet » seulement : une dApp ouverte a tout l'écran.
  const showTabBar = !activeTab.url && !editing;
  useFocusEffect(useCallback(() => {
    useTabBar.getState().setHidden(!showTabBar);
    return () => useTabBar.getState().setHidden(false);
  }, [showTabBar]));
  /*
   * Lien entrant. Un onglet (non privé) déjà ouvert sur le MÊME site est
   * réutilisé tel quel : sa page, sa session et son défilement sont gardés
   * (c'est ce qui évite de « tout perdre » en revenant sur l'émetteur de sa
   * carte). Sinon, un nouvel onglet — l'onglet en cours n'est plus écrasé.
   */
  const openDeepLink = useEffectEvent((u: string, chain?: string) => {
    const host = originOf(u);
    const evm = chain && listChains().some((c) => c.id === chain && c.family === 'evm') ? chain : undefined;
    const existing = tabsRef.current.find((x) => !x.incognito && x.url && originOf(x.url) === host);
    if (existing) {
      if (evm && existing.chainId !== evm) updateTab(existing.id, { chainId: evm });
      setActiveId(existing.id);
      return;
    }
    const cur = tabsRef.current.find((x) => x.id === activeRef.current);
    if (cur && !cur.url && !cur.incognito) {
      updateTab(cur.id, { url: u, ...(evm ? { chainId: evm } : {}) });
      return;
    }
    const tabItem = mkTab(evm ?? useWallet.getState().activeChain, u);
    setTabs((ts) => [...ts, tabItem]);
    setActiveId(tabItem.id);
  });
  useEffect(() => {
    const u = urlParam ? normalizeUrl(String(urlParam)) : null;
    if (u) openDeepLink(u, chainParam ? String(chainParam) : undefined);
  }, [urlParam, chainParam, navNonce]);

  // Site dangereux (GoPlus) — verdict définitif (sûr / signalé) gardé pour la session ; « non analysé » retenté.
  const scanSite = useCallback((host: string) => {
    const known = dangerHostsRef.current[host];
    if (!host || known === 'safe' || known === 'phishing' || scanInFlight.current.has(host) || !useSettings.getState().securityScan) return;
    scanInFlight.current.add(host);
    phishingSiteStatus(`https://${host}`)
      .then((v) => { setDangerHosts((d) => ({ ...d, [host]: v })); if (v === 'phishing') haptic.warning(); })
      .finally(() => scanInFlight.current.delete(host));
  }, []);
  useEffect(() => {
    if (origin) scanSite(origin);
  }, [origin, loadSeq, securityScan, scanSite]);
  const danger = !!origin && (dangerHosts[origin] === 'phishing' || isLookalike(origin));
  const shield = origin ? siteShield(origin, dangerHosts[origin], securityScan) : undefined;
  // Site signalé : la page n'est même pas chargée (aucun script exécuté) tant que l'utilisateur ne passe pas outre.
  const blocked = danger && !!origin && !bypassedHosts.has(origin);

  // ── Navigation ──
  const searchUrl = (q: string) => (ENGINES.find((e) => e.key === engine) ?? ENGINES[0]).url(q);
  const go = (raw?: string | null, title?: string) => {
    const target = (typeof raw === 'string' ? raw : '').trim();
    if (!target) return;
    const u = normalizeUrl(target) ?? searchUrl(target);
    updateTab(activeRef.current, { url: u });
    const tb = tabsRef.current.find((x) => x.id === activeRef.current);
    if (!tb?.incognito) pushRecent({ url: u, host: originOf(u), title: title || originOf(u) }, recentsRef.current).then(applyRecents);
    setEditing(false);
    setSwitcher(false);
    setInput('');
  };
  const newTab = (incognito = false) => {
    const tabItem = mkTab(useWallet.getState().activeChain, null, incognito);
    setTabs((ts) => [...ts, tabItem]);
    setActiveId(tabItem.id);
    setSwitcher(false);
    setMenu(false);
  };
  const closeTab = (id: string) => {
    const prev = tabsRef.current;
    const idx = prev.findIndex((t) => t.id === id);
    const next = prev.filter((t) => t.id !== id);
    if (next.length === 0) {
      const home = mkTab(useWallet.getState().activeChain);
      setTabs([home]);
      setActiveId(home.id);
      return;
    }
    setTabs(next);
    if (id === activeRef.current) setActiveId(next[Math.min(idx, next.length - 1)].id);
  };
  const goHome = () => updateTab(activeRef.current, { url: null, title: '' });
  /*
   * QUITTER SANS PERDRE LA PAGE. Au début de l'historique, « retour » vidait
   * l'onglet (la dApp rechargeait à la visite suivante) ; il fallait passer
   * par « Mettre de côté ». Désormais on revient à l'accueil et la page reste
   * vivante, connectée — la pastille de l'accueil y ramène.
   */
  const leaveBrowser = () => {
    const tab = tabsRef.current.find((x) => x.id === activeRef.current);
    if (tab?.url) useBrowserPresence.getState().park({ url: tab.url, title: tab.title || tab.url });
    router.navigate('/home');
  };
  const isFav = !!origin && favorites.some((f) => f.host === origin);
  const toggleCurrentFav = () => {
    if (!origin) return;
    haptic.light();
    toggleFavorite({ url: activeTab.url ?? `https://${origin}`, host: origin, title: activeTab.title || origin }, favRef.current).then((next) => {
      applyFav(next);
      toast.success(next.some((f) => f.host === origin) ? t('addedToFavorites') : t('removedFromFavorites'), origin);
    });
  };

  // ── Sécurité de navigation ──
  /*
   * La liste blanche de la WebView est « * » : tout ce qui n'y figure pas partait
   * directement en Linking.openURL SANS passer par ce filtre (react-native-webview,
   * WebViewShared). Sur iOS, canOpenURL est faux pour les schémas non déclarés :
   * metamask:/tg:/mailto: étaient ignorés en silence, et http:// filait vers Safari.
   * C'est donc ICI que tout est trié.
   */
  const onShouldStart = useCallback((req: { url: string; navigationType?: string; isTopFrame?: boolean }) => {
    const u = req.url;
    // iOS appelle aussi ce filtre pour les iframes (captcha, widgets) : jamais d'alerte ni d'app externe pour eux.
    if (req.isTopFrame === false) return /^(https:|about:|blob:)/i.test(u);
    if (/^http:\/\//i.test(u)) {
      // Pas de page en clair : on recharge la même adresse en https (si ce n'est pas déjà l'adresse courante, sinon boucle).
      const secure = u.replace(/^http:\/\//i, 'https://');
      const id = activeRef.current;
      const cur = tabsRef.current.find((x) => x.id === id)?.url;
      if (secure !== cur) {
        // Même effet qu'updateTab, par les seules références stables (le filtre reste mémoïsé).
        const next = tabsRef.current.map((x) => (x.id === id ? { ...x, url: secure } : x));
        tabsRef.current = next;
        setTabsState(next);
      }
      return false;
    }
    /*
     * CONNEXION PAR LIEN, DEPUIS LA PAGE. Un site qui n'utilise pas le
     * fournisseur injecté (Ethereum) — Jupiter et les dApps Solana, par
     * exemple — passe par WalletConnect et ouvre un lien `wc:` (ou un lien de
     * portefeuille qui l'enveloppe). Il partait vers « une autre app » et
     * échouait : la connexion se fait maintenant ici, par-dessus la page.
     */
    const wcUri = extractWcUri(u);
    if (wcUri) {
      if (isWcPairingUri(wcUri)) {
        useWalletConnect
          .getState()
          .pair(wcUri)
          .catch((e) => toast.error(t('connectionFailed'), /expired/i.test(String(e)) ? t('linkExpiredBody') : t('linkUnusable')));
      }
      return false;
    }
    if (!/^https:\/\//i.test(u) && looksLikeTonConnect(u)) {
      void useTonConnect
        .getState()
        .openLink(u)
        .then((err) => {
          if (err) toast.error(t('connectionFailed'), t(err as never));
        });
      return false;
    }
    if (/^https:\/\//i.test(u) || /^about:(blank|srcdoc)$/i.test(u)) {
      if (/\.apk(\?|$)/i.test(u)) {
        Alert.alert(t('downloadBlockedTitle'), t('downloadBlockedMsg'), [{ text: t('understood') }]);
        return false;
      }
      return true;
    }
    // Jamais transmis au système : `javascript:` s'exécuterait, `file:`/`data:` ouvriraient du contenu local ou forgé.
    if (/^\s*(javascript|file|data|blob|vbscript|about):/i.test(u)) return false;
    // Tout autre schéma (metamask:, tg:, mailto:, itms-apps:…) : l'utilisateur confirme avant de quitter l'app.
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) {
      const scheme = u.split(':')[0];
      Alert.alert(t('openOtherAppTitle'), t('openOtherAppMsg').replace('{scheme}', scheme), [
        { text: t('deny'), style: 'cancel' },
        { text: t('open'), onPress: () => Linking.openURL(u).catch(() => toast.error(t('cannotOpenLink'))) },
      ]);
      return false;
    }
    return false;
  }, [t]);

  // ── Pont EIP-1193 ──
  const connected = useRef<Set<string>>(new Set());
  /*
   * Clé de connexion : un onglet PRIVÉ a ses propres sites connectés. Avec une
   * clé commune, un site connecté dans un onglet normal voyait le compte dans
   * l'onglet privé (et inversement), sans rien demander.
   */
  const [pending, setPendingState] = useState<Pending | null>(null);
  /** Changement de réseau demandé par un site : il touche TOUTE l'app, donc il se confirme. */
  const [switchReq, setSwitchReq] = useState<{ tabId: string; id: number; origin: string; targetId: string; want: number } | null>(null);
  const switchReqRef = useRef<{ tabId: string; id: number; origin: string; targetId: string; want: number } | null>(null);
  /*
   * UNE demande à la fois, lue sans attendre un rendu. Une seconde demande
   * remplaçait la première sans lui répondre (la dApp restait bloquée), et la
   * fin d'une signature effaçait celle arrivée pendant ce temps.
   */
  const pendingRef = useRef<Pending | null>(null);
  const setPending = useCallback((p: Pending | null) => {
    pendingRef.current = p;
    setPendingState(p);
  }, []);
  /** Ferme CETTE demande seulement — jamais une autre arrivée entre-temps. */
  const closePending = useCallback((p: Pending) => {
    const cur = pendingRef.current;
    if (cur && cur.id === p.id && cur.tabId === p.tabId) setPending(null);
  }, [setPending]);
  const [sim, setSim] = useState<Simulation | 'loading' | null>(null);
  // Token d'un Permit / Permit2 (symbole + décimales) : registre local puis métadonnées ERC-20.
  const [permitToken, setPermitToken] = useState<{ symbol: string; decimals: number } | null>(null);
  const [signConfirm, setSignConfirm] = useState(false);
  const [risk, setRisk] = useState<RiskAssessment | 'loading' | null>(null);
  const [phishSite, setPhishSite] = useState(false);
  const [rememberSite, setRememberSite] = useState(false);
  // Fournisseur EVM + pont TON Connect (le site TON demande la connexion directement au wallet).
  // Jeton de page, tiré une fois : seuls les scripts injectés dans la page principale le connaissent.
  const pageToken = useMemo(() => bytesToHexToken(), []);
  const injected = useMemo(() => buildInjectedProvider(chainIdHex, pageToken) + '\n' + buildTonJsBridge(tcDeviceInfo(), pageToken), [chainIdHex, pageToken]);
  const inject = useCallback((js: string) => webref.current?.injectJavaScript(js), []);
  // Passage sur une adresse suivie : les sites connectés perdent le compte (ils ne doivent pas voir l'adresse suivie).
  useEffect(() => {
    if (!watchOnly) return;
    connected.current.clear();
    inject(emitJs('accountsChanged', []));
  }, [watchOnly, inject]);
  const revoked = useDappActivity((s) => s.revoked);
  useEffect(() => {
    if (!revoked) return;
    for (const host of revoked.hosts) {
      connected.current.delete(connKey(host, false));
      connected.current.delete(connKey(host, true));
    }
    const tab = tabsRef.current.find((x) => x.id === activeRef.current);
    const activeHost = tab?.url ? originOf(tab.url) : null;
    if (activeHost && revoked.hosts.includes(activeHost)) {
      inject(emitJs('accountsChanged', []));
      inject(emitJs('disconnect', {}));
    }
  }, [revoked, inject]);
  useEffect(() => {
    if (!dappEpoch) return;
    connected.current.clear();
    inject(emitJs('accountsChanged', []));
    inject(emitJs('disconnect', {}));
  }, [dappEpoch, inject]);
  /*
   * Réponses TON Connect vers la page : exécutées seulement si la page ouverte
   * est TOUJOURS celle qui a demandé — une réponse ne doit jamais atterrir sur
   * le site suivant.
   */
  useEffect(() => {
    tcJsHost.deliver = (host, js) => {
      const tab = tabsRef.current.find((x) => x.id === activeRef.current);
      if (tab?.url && originOf(tab.url) === host) inject(js);
    };
    return () => {
      tcJsHost.deliver = null;
    };
  }, [inject]);
  const respond = useCallback((id: number, result: unknown, err?: { code: number; message: string }) => inject(respondJs(id, result, err)), [inject]);
  /**
   * Réponse à une demande APPROUVÉE (ou refusée) plus tard, dans la fenêtre :
   * livrée seulement si l'onglet affiche TOUJOURS le site qui a demandé. Entre la
   * demande et l'approbation, la page peut avoir changé — une signature ne doit
   * jamais atterrir sur le site suivant (même règle que TON Connect).
   */
  const deliverTo = useCallback((host: string, tabId: string, js: string) => {
    const tab = tabsRef.current.find((x) => x.id === activeRef.current);
    if (!tab || tab.id !== tabId || originOf(tab.url ?? '') !== host) {
      technicalLogger.logDapp('response_dropped_page_changed', host, { tabId }, true);
      return;
    }
    inject(js);
  }, [inject]);
  const respondPending = useCallback(
    (p: { id: number; origin: string; tabId: string }, result: unknown, err?: { code: number; message: string }) => deliverTo(p.origin, p.tabId, respondJs(p.id, result, err)),
    [deliverTo],
  );
  const reject = useCallback((p: { id: number; origin: string; tabId: string }, code = 4001, message = t('refuse')) => {
    technicalLogger.logDapp('request_rejected_by_user', undefined, { code, message }, true);
    return respondPending(p, null, { code, message });
  }, [respondPending, t]);

  const onDappRequest = useCallback(
    async (req: DappRequest, reqOrigin: string, tabId: string) => {
      const { id, method, params } = req;
      technicalLogger.logDapp(`method_${method}`, reqOrigin);
      const addr = watchOnly ? undefined : evmAddress; // lecture seule : aucun compte exposé (eth_accounts vide, sites mémorisés compris)
      const tb = tabsRef.current.find((x) => x.id === tabId);
      const isConnected = !!reqOrigin && connected.current.has(connKey(reqOrigin, tb?.incognito));
      /** Une demande attend déjà la décision de l'utilisateur : celle-ci est refusée tout de suite (EIP-1193, -32002). */
      const openPending = (p: Pending) => {
        if (pendingRef.current) return respond(id, null, { code: -32002, message: t('dappErrRequestPending') });
        setPending(p);
      };
      try {
        if (method === 'eth_chainId') return respond(id, chainIdHex);
        /*
         * Page NON https : pas d'origine fiable. Toutes les pages http
         * partageaient la même clé « '' » : connecter l'une donnait l'adresse
         * à toutes les autres, sans rien demander. Lecture seule autorisée,
         * aucune connexion ni signature.
         */
        if (!reqOrigin && !READONLY_METHODS.has(method) && method !== 'net_version' && method !== 'eth_accounts' && method !== 'wallet_getPermissions') {
          return respond(id, null, { code: 4100, message: t('dappErrHttpsRequired') });
        }
        if (method === 'net_version') return respond(id, String(chain.evmChainId ?? 1));
        if (method === 'eth_accounts') return respond(id, isConnected && addr ? [addr] : []);
        if (method === 'wallet_getPermissions') return respond(id, isConnected ? [{ parentCapability: 'eth_accounts' }] : []);
        if (method === 'eth_requestAccounts' || method === 'wallet_requestPermissions') {
          if (isConnected && addr) return respond(id, method === 'eth_requestAccounts' ? [addr] : [{ parentCapability: 'eth_accounts' }]);
          // Reconnexion silencieuse d'un site mémorisé — jamais s'il est signalé depuis.
          const reqDanger = dangerHostsRef.current[reqOrigin] === 'phishing' || isLookalike(reqOrigin);
          if (addr && !tb?.incognito && !reqDanger && useDappActivity.getState().isRemembered(reqOrigin)) {
            connected.current.add(connKey(reqOrigin, false));
            inject(emitJs('accountsChanged', [addr]));
            inject(emitJs('connect', { chainId: chainIdHex }));
            useDappActivity.getState().addConnection({ host: reqOrigin, url: `https://${reqOrigin}`, title: reqOrigin });
            return respond(id, method === 'eth_requestAccounts' ? [addr] : [{ parentCapability: 'eth_accounts' }]);
          }
          openPending({ kind: 'connect', tabId, id, origin: reqOrigin });
          return;
        }
        if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') {
          /*
           * Site CONNECTÉ seulement : n'importe quelle page ouverte changeait le
           * réseau actif de toute l'app, sans rien demander.
           */
          if (!isConnected) return respond(id, null, { code: 4100, message: t('notConnected') });
          const want = Number((params[0] as { chainId?: string })?.chainId ?? '0x0');
          const target = listChains().find((c) => c.family === 'evm' && c.evmChainId === want);
          if (!target) return respond(id, null, { code: 4902, message: t('networkNotSupported') });
          // Déjà sur ce réseau : rien à changer, rien à demander.
          if (target.id === (tb?.chainId ?? activeChain)) return respond(id, null);
          /*
           * CONFIRMATION. Le réseau actif est celui de toute l'app (soldes,
           * envois) : un site connecté le changeait sans rien demander — un
           * envoi suivant pouvait partir sur un réseau que l'utilisateur
           * n'avait pas choisi.
           */
          if (switchReqRef.current) return respond(id, null, { code: -32002, message: t('dappErrRequestPending') });
          const req = { tabId, id, origin: reqOrigin, targetId: target.id, want };
          switchReqRef.current = req;
          setSwitchReq(req);
          return;
        }
        const isSigning = method === 'personal_sign' || method === 'eth_sign' || method.startsWith('eth_signTypedData') || method === 'eth_sendTransaction';
        if (isSigning) {
          if (!isConnected || !addr) return respond(id, null, { code: 4100, message: t('notConnected') });
          if (method === 'personal_sign' || method === 'eth_sign') {
            const hex = signMessageParam(method, params);
            const text = hexToText(hex) ?? (hex.startsWith('0x') ? null : hex);
            openPending({ kind: 'sign', tabId, id, origin: reqOrigin, hex, text, siwe: text ? parseSiwe(text) : null });
            return;
          }
          if (method.startsWith('eth_signTypedData')) {
            const rawData = params[1];
            const data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
            // Réseau de la DEMANDE, figé maintenant : onglet non EVM → refus (le contrôle anti-rejeu serait sauté).
            if (!chain.evmChainId) return respond(id, null, { code: 4901, message: t('dappErrSwitchToEvm') });
            openPending({ kind: 'typedData', tabId, id, origin: reqOrigin, data, summary: summarizeTypedData(data), evmChainId: chain.evmChainId });
            return;
          }
          const tx = (params[0] ?? {}) as { from?: string; to?: string; value?: string; data?: string; gas?: string };
          if (!tx.to || !isValidEvmAddress(tx.to)) return respond(id, null, { code: 4200, message: t('dappErrNoContractDeploy') });
          // Transaction préparée pour un AUTRE compte (changé depuis la connexion) : on ne la signe pas avec celui-ci.
          if (tx.from && tx.from.toLowerCase() !== addr.toLowerCase()) return respond(id, null, { code: 4100, message: t('dappErrWrongAccount') });
          const raw: RawTxRequest = { to: tx.to, data: tx.data ?? '0x', value: tx.value ? BigInt(tx.value) : 0n, chainId: chain.evmChainId!, gasLimit: tx.gas ? BigInt(tx.gas) : undefined };
          openPending({ kind: 'tx', tabId, id, origin: reqOrigin, to: tx.to, value: raw.value ?? 0n, raw, chainId: chain.id });
          return;
        }
        if (READONLY_METHODS.has(method)) return respond(id, await rpcProxy(chain.rpcUrls, method, params));
        respond(id, null, { code: -32601, message: `${t('methodNotSupported')}${method}` });
      } catch (e) {
        // Erreur JSON-RPC du nœud (ex. « execution reverted ») : son code est relayé tel quel.
        respond(id, null, { code: e instanceof RpcProxyError ? e.code : -32603, message: e instanceof Error ? e.message.slice(0, 160) : t('internalError') });
      }
    },
    [evmAddress, watchOnly, chain, chainIdHex, respond, inject, activeChain, setPending, t],
  );

  // Analyse GoPlus + simulation à l'apparition d'une demande.
  const analyzePending = useEffectEvent((isAlive: () => boolean) => {
    setRisk(null); setPhishSite(false); setSim(null); setSignConfirm(false); setPermitToken(null);
    if (!pending) return;
    if (pending.kind === 'typedData' && pending.summary?.token) {
      const addr = pending.summary.token;
      const tChain = listChains().find((c) => c.family === 'evm' && c.evmChainId === pending.summary?.chainId) ?? chain;
      const local = (useTokenStore.getState().tokensByChain[tChain.id] ?? []).find((tk) => tk.address.toLowerCase() === addr.toLowerCase());
      if (local) setPermitToken({ symbol: local.symbol, decimals: local.decimals });
      else getTokenMetadata(tChain, addr).then((m) => { if (m) setPermitToken({ symbol: m.symbol, decimals: m.decimals }); }).catch(() => {});
    }
    haptic.light();
    if (useSettings.getState().securityScan) {
      const cid = chain.evmChainId ?? 1;
      if (pending.kind === 'tx' && pending.to) { setRisk('loading'); assessAddress(cid, pending.to).then((r) => { setRisk(r); if (r?.level === 'danger') haptic.warning(); }).catch(() => setRisk(null)); }
      else if (pending.kind === 'typedData' && pending.summary?.verifyingContract) { setRisk('loading'); assessAddress(cid, pending.summary.verifyingContract).then((r) => { setRisk(r); if (r?.level === 'danger') haptic.warning(); }).catch(() => setRisk(null)); }
      else if (pending.kind === 'connect') { isPhishingSite(`https://${pending.origin}`).then((r) => { setPhishSite(r); if (r) haptic.warning(); }).catch(() => {}); }
    }
    if (pending.kind === 'tx' && evmAddress) {
      setSim('loading');
      (async () => {
        const d = decodeTx({ to: pending.raw.to, value: pending.raw.value, data: pending.raw.data });
        const meta = d.kind === 'transfer' || d.kind === 'approve' ? await getTokenMetadata(chain, d.token).catch(() => null) : null;
        const r = await simulateTx(chain, { from: evmAddress, to: pending.raw.to, value: pending.raw.value, data: pending.raw.data }, meta ? { symbol: meta.symbol, decimals: meta.decimals } : undefined);
        if (isAlive()) setSim(r);
      })();
    }
  });
  const pendingId = pending?.id;
  useEffect(() => {
    let alive = true;
    analyzePending(() => alive);
    return () => { alive = false; };
  }, [pendingId]);

  const explanation = useMemo(() => {
    if (!pending || pending.kind === 'connect') return null;
    const addressRisk = risk && risk !== 'loading' ? risk : null;
    if (pending.kind === 'sign') return explainRequest({ kind: pending.siwe ? 'siwe' : 'message', domain: pending.origin, siwe: pending.siwe, siweMismatch: !!pending.siwe && siweDomainMismatch(pending.siwe.domain, `https://${pending.origin}`), messageText: pending.text, addressRisk, phishingSite: phishSite, t: exT });
    if (pending.kind === 'typedData') return explainRequest({ kind: 'typedData', domain: pending.origin, typed: pending.summary, tokenSymbol: permitToken?.symbol ?? null, tokenDecimals: permitToken?.decimals ?? null, addressRisk, phishingSite: phishSite, connectedChainId: chain.evmChainId, t: exT });
    const decoded = decodeTx({ to: pending.raw.to, value: pending.raw.value, data: pending.raw.data });
    return explainRequest({ kind: 'tx', domain: pending.origin, decoded, simulation: sim && sim !== 'loading' ? sim : null, addressRisk, phishingSite: phishSite, nativeSymbol: chain.nativeSymbol, nativeDecimals: chain.nativeDecimals, txValue: pending.kind === 'tx' ? pending.value : undefined, simulating: sim === 'loading', t: exT });
  }, [pending, sim, risk, phishSite, permitToken, exT, chain]);

  const perform = async (unlock: Unlock) => {
    if (!pending || !account || !evmAddress) return;
    const activity = useDappActivity.getState();
    const tb = tabsRef.current.find((x) => x.id === pending.tabId);
    if (pending.kind === 'connect') {
      // Lecture seule : lève WATCH_ONLY, rien n'est partagé avec le site.
      await useWallet.getState().verifyConnect(unlock);
      connected.current.add(connKey(pending.origin, tb?.incognito));
      respondPending(pending, [evmAddress]);
      /*
       * Demande RÉPONDUE : libérée avant l'animation (la feuille reste affichée).
       * Une signature demandée aussitôt connecté (SIWE) ne doit pas recevoir -32002.
       */
      if (pendingRef.current === pending) pendingRef.current = null;
      deliverTo(pending.origin, pending.tabId, emitJs('accountsChanged', [evmAddress]));
      deliverTo(pending.origin, pending.tabId, emitJs('connect', { chainId: chainIdHex }));
      if (!tb?.incognito) {
        activity.addConnection({ host: pending.origin, url: `https://${pending.origin}`, title: tb?.title || pending.origin });
        if (rememberSite) activity.remember(pending.origin);
      }
      haptic.success();
      await new Promise((r) => setTimeout(r, 450));
    } else {
      const w = useWallet.getState();
      let result: string;
      // Liste blanche en vigueur : aucune signature de dApp (un simple message peut autoriser un transfert).
      await (await import('../../lib/whitelistStore')).assertDappAllowed();
      if (pending.kind === 'sign') result = await w.signMessage(unlock, pending.hex);
      else if (pending.kind === 'typedData') result = await w.signTypedData(unlock, pending.data as Parameters<typeof w.signTypedData>[1], pending.evmChainId);
      // Le réseau de la DEMANDE, pas celui de l'onglet maintenant : le Chain ID signé doit correspondre au nœud qui diffuse.
      else result = await w.sendRawTxOn(unlock, pending.kind === 'tx' ? pending.chainId : tb?.chainId ?? activeChain, pending.raw);
      respondPending(pending, result);
      if (pending.kind === 'tx' && tb?.chainId) {
        if (evmAddress) {
          void useHistoryStore.getState().fetchHistory(tb.chainId, evmAddress, { force: true });
        }
      }
      if (!tb?.incognito) activity.addSignature({ host: pending.origin, kind: pending.kind === 'tx' ? 'tx' : pending.kind === 'typedData' ? 'typedData' : 'sign' });
      haptic.success();
      sound.success();
    }
    closePending(pending);
    setRememberSite(false);
  };
  const answerSwitch = (ok: boolean) => {
    const r = switchReqRef.current;
    switchReqRef.current = null;
    setSwitchReq(null);
    if (!r) return;
    if (!ok) return deliverTo(r.origin, r.tabId, respondJs(r.id, null, { code: 4001, message: t('refuse') }));
    updateTab(r.tabId, { chainId: r.targetId });
    setActiveChain(r.targetId);
    deliverTo(r.origin, r.tabId, respondJs(r.id, null));
    deliverTo(r.origin, r.tabId, emitJs('chainChanged', '0x' + r.want.toString(16)));
  };
  const deny = () => {
    if (pending) {
      reject(pending);
      closePending(pending);
    }
    setRememberSite(false);
    setSignConfirm(false);
  };

  // ── Suggestions ──
  const q = input.trim().toLowerCase();
  const suggestions = useMemo(() => {
    if (!q) return [] as { host: string; title: string; url: string; kind: 'fav' | 'recent' | 'verified' }[];
    const out: { host: string; title: string; url: string; kind: 'fav' | 'recent' | 'verified' }[] = [];
    const seen = new Set<string>();
    const add = (x: { host: string; title: string; url: string; kind: 'fav' | 'recent' | 'verified' }) => { if (!seen.has(x.host)) { seen.add(x.host); out.push(x); } };
    favorites.filter((f) => f.host.includes(q) || f.title.toLowerCase().includes(q)).forEach((f) => add({ ...f, kind: 'fav' }));
    recents.filter((r) => r.host.includes(q) || r.title.toLowerCase().includes(q)).forEach((r) => add({ ...r, kind: 'recent' }));
    VERIFIED_DAPPS.flatMap((c) => c.items).filter((d) => d.host.includes(q) || d.name.toLowerCase().includes(q)).forEach((d) => add({ host: d.host, title: d.name, url: d.url, kind: 'verified' }));
    return out.slice(0, 8);
  }, [q, favorites, recents]);

  if (!WebViewComp) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: SCREEN_MARGIN, paddingTop: insets.top + 48, justifyContent: 'center' }}>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenDunes />
        <Card><EmptyState icon="dapps" title={t('browserUnavailableTitle')} body={t('browserUnavailableMsg')} actionLabel={t('back')} onAction={() => goBack()} /></Card>
      </View>
    );
  }
  const WebViewAny = WebViewComp as React.ComponentType<Record<string, unknown>>;
  const Highlight = ({ text }: { text: string }) => {
    const i = q ? text.toLowerCase().indexOf(q) : -1;
    if (i < 0) return <Text variant="body" numberOfLines={1}>{text}</Text>;
    return <Text variant="body" tone="secondary" numberOfLines={1}>{text.slice(0, i)}<Text variant="body">{text.slice(i, i + q.length)}</Text>{text.slice(i + q.length)}</Text>;
  };

  // ── Page nouvel onglet (Nova) ──
  /*
   * Appelée comme une FONCTION (`{NewTabPage()}`), pas comme un composant :
   * définie dans le rendu, `<NewTabPage />` changeait d'identité à chaque
   * rendu, et React démontait puis remontait toute la page — les animations
   * d'entrée auraient rejoué à chaque octet de progression.
   */
  const NewTabPage = () => {
    const cat = VERIFIED_DAPPS.find((c) => c.category === category) ?? VERIFIED_DAPPS[0];
    const card = { borderRadius: radii.xl, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.border } as const;
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, padding: SCREEN_MARGIN, paddingTop: space[3], paddingBottom: space[10], gap: space[5] }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* En-tête : le titre, et la même orbite que l'accueil, en petit, en haut à droite. */}
        <View style={{ height: 76, justifyContent: 'center' }}>
          <View pointerEvents="none" style={{ position: 'absolute', right: 34, top: 38 }}>
          </View>
          <Rise><Text variant="title1">{t('navExplore')}</Text></Rise>
        </View>
        {activeTab.incognito ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <Icon name="incognito" size={18} tone="muted" />
            <Text variant="caption" tone="secondary">{t('privateTabMsg')}</Text>
          </View>
        ) : null}
        {favorites.length > 0 ? (
          <Rise delay={60} style={{ gap: space[3] }}>
            <Text variant="title2">{t('favorites')}</Text>
            <View style={[card, { flexDirection: 'row', flexWrap: 'wrap', rowGap: space[4], paddingVertical: space[4], paddingHorizontal: space[2] }]}>
              {favorites.map((f) => <DappTile key={f.host} host={f.host} label={f.title || f.host} width="33.33%" onPress={() => go(f.url, f.title)} />)}
            </View>
          </Rise>
        ) : null}
        {recents.length > 0 && !activeTab.incognito ? (
          <Rise delay={110} style={{ gap: space[3] }}>
            <Text variant="title2">{t('recents')}</Text>
            <View style={[card, { paddingVertical: space[1], overflow: 'hidden' }]}>
              {recents.slice(0, 5).map((r, i, arr) => (
                <React.Fragment key={r.host}>
                  <ListRow style={{ minHeight: 60 }} left={<DappLogo host={r.host} size={34} />} title={siteName(r.host)} subtitle={r.host} onPress={() => go(r.url, siteName(r.host))} />
                  {i < arr.length - 1 ? <Divider inset={66} /> : null}
                </React.Fragment>
              ))}
            </View>
          </Rise>
        ) : null}
        <Rise delay={160} style={{ gap: space[4] }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: space[4] }}>
            <TextTabs variant="underline" items={VERIFIED_DAPPS.map((c) => ({ key: c.category, label: c.category }))} value={category} onChange={(k) => { haptic.selection(); setCategory(k); }} />
          </ScrollView>
          {/* Trois par ligne : à deux colonnes, la carte laissait un grand vide à droite. */}
          <View style={[card, { flexDirection: 'row', flexWrap: 'wrap', rowGap: space[4], paddingVertical: space[4], paddingHorizontal: space[2] }]}>
            {cat.items.map((d) => <DappTile key={d.host} host={d.host} label={d.name} width="33.33%" badge={dappCompat(d).map((c) => t(COMPAT_KEY[c] as never)).join(' · ')} onPress={() => go(d.url, d.name)} />)}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[2] }}>
            <Icon name="security" size={14} color={colors.up} />
            <Text variant="caption" tone="secondary" style={{ flex: 1, fontFamily: 'GeneralSans-Regular' }}>{t('verifiedDappsMsg')}</Text>
          </View>
          {/* Aucun fournisseur Solana injecté : une dApp Solana se connecte seulement par un lien WalletConnect. */}
          {cat.items.some((d) => dappCompat(d).includes('walletconnect')) ? (
            <KPressable onPress={() => setLinkSheet(true)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[2] }}>
              <Icon name="walletconnect" size={14} tone="muted" />
              <Text variant="caption" tone="secondary" style={{ flex: 1, fontFamily: 'GeneralSans-Regular' }}>{t('dappCompatWalletConnectHelp')}</Text>
            </KPressable>
          ) : null}
        </Rise>
      </ScrollView>
    );
  };

  const siteConn = origin ? connections.find((c) => c.host === origin) : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Page d'accueil des onglets : les dunes de scène. Une dApp ouverte occupe l'écran, sans décor. */}
      {activeTab.url ? null : <ScreenDunes />}
      <View style={{ height: insets.top, backgroundColor: activeTab.url ? colors.bg : 'transparent' }} />
      <Comet progress={progress} active={!!activeTab.url} />

      {/* Contenu : UNE WebView (onglet actif) ou la page nouvel onglet */}
      <View style={{ flex: 1 }}>
        {activeTab.url ? (
          blocked ? (
            <View style={{ flex: 1, justifyContent: 'center', padding: SCREEN_MARGIN }}>
              <Card style={{ gap: space[3], alignItems: 'center', borderWidth: 1, borderColor: colors.danger }}>
                <Icon name="warning" size={32} color={colors.danger} />
                <Text variant="title2" style={{ textAlign: 'center' }}>{t('siteBlockedTitle')}</Text>
                <Text variant="bodySecondary" tone="secondary" style={{ textAlign: 'center' }}>
                  {fill(t('siteBlockedBody'), { host: origin ?? '' })}
                </Text>
                <Button label={t('siteBlockedLeave')} icon="caretLeft" onPress={goHome} />
                <Button
                  label={t('siteBlockedContinue')}
                  variant="secondary"
                  onPress={() => {
                    haptic.warning();
                    if (origin) setBypassedHosts((prev) => new Set(prev).add(origin));
                  }}
                />
              </Card>
            </View>
          ) : webError ? (
            <View style={{ flex: 1, justifyContent: 'center', padding: SCREEN_MARGIN }}>
              <Card style={{ gap: space[3], alignItems: 'center' }}>
                <Icon name="warning" size={28} color={colors.warning} />
                <Text variant="title2" style={{ textAlign: 'center' }}>{t('cannotOpenPage')}</Text>
                <Text variant="bodySecondary" tone="secondary" style={{ textAlign: 'center' }}>
                  {t('siteNotResponding')}
                </Text>
                <Text variant="caption" tone="tertiary" style={{ textAlign: 'center' }} numberOfLines={2}>{webError}</Text>
                <Button label={t('retry')} icon="refresh" onPress={() => { setWebError(null); progress.set(0); }} />
                <Button label={t('backToHome')} variant="secondary" onPress={goHome} />
              </Card>
            </View>
          ) : <WebViewAny
            key={`${activeTab.id}:${activeTab.desktop ? 'd' : 'm'}`}
            ref={(r: WV | null) => { webref.current = r; }}
            source={{ uri: activeTab.url }}
            // « * » : chaque navigation passe par onShouldStart (voir plus haut), seul filtre.
            originWhitelist={['*']}
            onShouldStartLoadWithRequest={onShouldStart}
            onLoadProgress={(e: { nativeEvent: { progress: number } }) => progress.set(e.nativeEvent.progress)}
            onLoadStart={() => setLoadSeq((n) => n + 1)}
            onError={(e: { nativeEvent?: { description?: string; code?: number } }) => {
              const errDesc = e.nativeEvent?.description || `${t('networkError')}${e.nativeEvent?.code ? ` (${e.nativeEvent.code})` : ''}`;
              setWebError(errDesc);
              technicalLogger.logDapp('page_load_failed', activeTab.url || undefined, { error: errDesc, code: e.nativeEvent?.code }, true);
            }}
            onScroll={onWebScroll}
            injectedJavaScriptBeforeContentLoaded={injected}
            onMessage={(e: { nativeEvent: { data: string; url?: string } }) => {
              const tc = parseTcJsMessage(e.nativeEvent.data, pageToken);
              if (tc) {
                const host = originOf(e.nativeEvent.url ?? activeTab.url ?? '');
                if (host) void useTonConnect.getState().jsCall(host, tc);
                return;
              }
              const req = parseDappMessage(e.nativeEvent.data, pageToken);
              if (req) onDappRequest(req, originOf(e.nativeEvent.url ?? activeTab.url ?? ''), activeTab.id);
            }}
            onNavigationStateChange={(nav: { url: string; title?: string; canGoBack: boolean; canGoForward: boolean }) => {
              updateTab(activeTab.id, { url: nav.url, title: nav.title ?? '', canBack: nav.canGoBack, canFwd: nav.canGoForward });
              setBrowserContext({ currentUrl: nav.url, currentTitle: nav.title || '' });
              const host = originOf(nav.url);
              const top = recentsRef.current[0];
              if (!activeTab.incognito && host && !(top && top.host === host)) pushRecent({ url: nav.url, host, title: siteName(host) }, recentsRef.current).then(applyRecents);
            }}
            // iOS tue le processus web en mémoire basse : page blanche figée sans ce rechargement.
            onContentProcessDidTerminate={() => webref.current?.reload()}
            // Vidéos lues dans la page (sinon iOS force le plein écran).
            allowsInlineMediaPlayback
            /*
             * SESSIONS PERSISTANTES : stockage local, cache et cookies (tiers
             * compris, sur Android) gardés d'une ouverture de l'app à l'autre —
             * on reste connecté à l'émetteur de sa carte, à ses dApps. Un onglet
             * privé (incognito) n'en garde rien.
             */
            domStorageEnabled
            cacheEnabled
            thirdPartyCookiesEnabled
            allowsBackForwardNavigationGestures
            pullToRefreshEnabled
            setSupportMultipleWindows={false}
            incognito={activeTab.incognito}
            forceDarkOn={forceDark}
            userAgent={activeTab.desktop ? DESKTOP_UA : undefined}
            style={{ flex: 1, backgroundColor: colors.bg }}
          />
        ) : (
          NewTabPage()
        )}

        {/* Suggestions (mode édition) */}
        {editing ? (
          <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: colors.bg }}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: SCREEN_MARGIN, paddingTop: space[4], gap: space[2] }}>
              {q ? (
                <>
                  {suggestions.map((s) => (
                    <KPressable key={s.host} onPress={() => go(s.url, s.title)} noScale style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 56 }}>
                      <DappLogo host={s.host} size={32} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Highlight text={s.title || s.host} />
                        <Text variant="caption" tone="tertiary" numberOfLines={1}>{s.host}</Text>
                      </View>
                      <Icon name={s.kind === 'fav' ? 'starFilled' : s.kind === 'verified' ? 'check' : 'history'} size={14} tone="faint" />
                    </KPressable>
                  ))}
                  <ListRow left={<View style={{ width: 32, alignItems: 'center' }}><Icon name="search" size={18} tone="muted" /></View>} title={normalizeUrl(input) ? `${t('openUrl')} ${input.trim()}` : `${t('searchQuery')} « ${input.trim()} »`} subtitle={normalizeUrl(input) ? undefined : `${t('searchQuery')} ${ENGINES.find((e) => e.key === engine)?.label ?? ''}`} onPress={() => go(input)} />
                </>
              ) : (
                <>
                  {favorites.length > 0 ? <Text variant="caption" tone="secondary">{t('favorites')}</Text> : null}
                  {favorites.slice(0, 4).map((f) => <ListRow key={f.host} left={<DappLogo host={f.host} size={32} />} title={f.title || f.host} subtitle={f.host} onPress={() => go(f.url, f.title)} />)}
                  {recents.length > 0 && !activeTab.incognito ? <Text variant="caption" tone="secondary" style={{ marginTop: space[2] }}>{t('recents')}</Text> : null}
                  {(activeTab.incognito ? [] : recents.slice(0, 6)).map((r) => <ListRow key={r.host} left={<DappLogo host={r.host} size={32} />} title={r.title || r.host} subtitle={r.host} onPress={() => go(r.url, r.title)} />)}
                </>
              )}
            </ScrollView>
          </View>
        ) : null}
      </View>

      {/*
        Chrome du bas : [←] [adresse] [onglets] [⋮]

        LA BARRE MONTE AVEC LE CLAVIER, explicitement. L'affichage bord à bord
        imposé depuis Android 15 empêche `adjustResize` de redimensionner la
        fenêtre, et le `behavior` de `KeyboardAvoidingView` valait `undefined`
        sur Android : la barre d'adresse se retrouvait sous le clavier dès qu'on
        la touchait pour taper. La marge de sécurité du bas est abandonnée
        pendant ce temps — le clavier occupe déjà la place, l'ajouter creuserait
        un trou.
      */}
      <View style={{ marginBottom: kbHeight }}>
        <Animated.View style={[{ flexDirection: 'row', alignItems: 'center', gap: space[1], paddingHorizontal: space[2], paddingTop: space[2], paddingBottom: showTabBar ? insets.bottom + 84 : (kbHeight > 0 ? space[2] : insets.bottom + space[2]), backgroundColor: colors.bg }, chromeStyle]}>
          {editing ? (
            <>
              <IconButton icon="close" label={t('cancel')} tone="ghost" onPress={() => { setEditing(false); setInput(''); }} />
              <View style={{ flex: 1, height: 48, borderRadius: radius.round, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.textSecondary, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[4], gap: space[2] }}>
                <Icon name="search" size={15} tone="muted" />
                <TextInput autoFocus value={input} onChangeText={setInput} onSubmitEditing={() => go(input)} placeholder={t('searchOrEnterUrl')} placeholderTextColor={colors.textTertiary} autoCapitalize="none" autoCorrect={false} keyboardType="url" returnKeyType="go" selectTextOnFocus style={{ flex: 1, color: colors.text, fontSize: fontSize.lg, fontFamily: 'GeneralSans-Medium', paddingVertical: 0 }} />
                {input ? <KPressable onPress={() => setInput('')} hitSlop={8} accessibilityLabel={t('cancel')}><Icon name="close" size={14} tone="muted" /></KPressable> : null}
              </View>
              <IconButton icon="scan" label={t('scanQr')} tone="ghost" onPress={() => router.push('/scan')} />
            </>
          ) : (
            <>
              <IconButton icon="caretLeft" label={t('previousPage')} tone="ghost" disabled={!activeTab.url && tabs.length === 1} onPress={() => (activeTab.canBack ? webref.current?.goBack() : activeTab.url ? leaveBrowser() : goBack())} />
              <AddressBar
                host={origin}
                secure={!!activeTab.url?.startsWith('https://')}
                danger={danger}
                incognito={activeTab.incognito}
                address={origin ? evmAddress : undefined}
                chainId={activeTab.chainId}
                compact={compact}
                loading={pageLoading}
                placeholder={t('searchOrEnterUrl')}
                onPress={() => { compact.value = withSpring(0, springs.standard); setInput(activeTab.url ?? ''); setEditing(true); }}
                onLongPress={() => { if (activeTab.url) { Clipboard.setStringAsync(activeTab.url); haptic.light(); toast.success(t('linkCopied'), origin); } }}
                onAccount={() => setConnSheet(true)}
                shield={shield}
                onShield={() => setShieldSheet(true)}
              />
              <KPressable onPress={() => setSwitcher(true)} accessibilityLabel={`${tabs.length} ${t('tabs')}`} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
                  {/* Le carré Phosphor occupe ~75 % de sa boîte : 32 donne le cadre de 24 d'origine. */}
                  <View style={{ position: 'absolute' }}><Icon name="tabFrame" size={32} weight="bold" /></View>
                  <Text variant="micro" tabular>{tabs.length}</Text>
                </View>
              </KPressable>
              <IconButton icon="more" label={t('menu')} tone="ghost" onPress={() => setMenu(true)} />
            </>
          )}
        </Animated.View>
      </View>

      {/* Grille d'onglets */}
      <Sheet visible={switcher} onClose={() => setSwitcher(false)}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="title2">{t('tabs')} · {tabs.length}</Text>
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            <Chip label={t('private')} icon="incognito" onPress={() => newTab(true)} />
            <Chip label={t('newTab')} icon="add" onPress={() => newTab(false)} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
          {tabs.map((tb) => {
            const w = (screenW - SCREEN_MARGIN * 2 - space[3]) / 2;
            const host = tb.url ? originOf(tb.url) : '';
            const on = tb.id === activeId;
            return (
              <KPressable key={tb.id} onPress={() => { setActiveId(tb.id); setSwitcher(false); }} accessibilityLabel={tb.title || host || t('newTab')} style={{ width: w }}>
                <View style={{ height: w * 0.75, borderRadius: radius.container, backgroundColor: tb.incognito ? colors.bg : colors.surface1, borderWidth: on ? 2 : 1, borderColor: on ? colors.text : tb.incognito ? colors.textSecondary : colors.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {host ? <DappLogo host={host} size={40} /> : <Icon name={tb.incognito ? 'incognito' : 'add'} size={28} tone="faint" />}
                  <KPressable onPress={() => closeTab(tb.id)} hitSlop={8} accessibilityLabel={t('closeTab')} style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: radii.full, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="close" size={14} />
                  </KPressable>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space[1] }}>
                  {host ? <DappLogo host={host} size={14} /> : null}
                  <Text variant="caption" numberOfLines={1} style={{ flex: 1 }}>{tb.title || host || (tb.incognito ? t('privateTab') : t('newTab'))}</Text>
                </View>
              </KPressable>
            );
          })}
        </View>
      </Sheet>

      {/* Menu ⋮ — lignes directement sur le sheet (pas de carte dans le sheet) */}
      <Sheet visible={menu} onClose={() => setMenu(false)}>
        <View style={{ marginHorizontal: -space[5] }}>
          {activeTab.url ? (
            <>
              <ListRow left={<Icon name={isFav ? 'starFilled' : 'star'} size={20} />} title={isFav ? t('removedFromFavorites') : t('addedToFavorites')} onPress={() => { setMenu(false); toggleCurrentFav(); }} />
              <ListRow left={<Icon name="share" size={20} />} title={t('share')} onPress={() => {
                  setMenu(false);
                  // iOS : la feuille de partage présentée pendant la fermeture du menu n'apparaît pas — on attend la fin de l'animation.
                  const url = activeTab.url!;
                  setTimeout(() => { Share.share({ message: url }).catch(() => {}); }, Platform.OS === 'ios' ? 450 : 0);
                }} />
              <ListRow left={<Icon name="search" size={20} />} title={t('searchInPage')} onPress={() => { setMenu(false); setFindSheet(true); }} />
              <ListRow left={<Icon name="desktop" size={20} />} title={t('desktopVersion')} right={<Switch value={activeTab.desktop} onValueChange={(v) => updateTab(activeTab.id, { desktop: v })} />} />
              <ListRow left={<Icon name="walletconnect" size={20} />} title={t('siteConnection')} subtitle={siteConn ? `${t('connected')} · ${chain.name}` : t('notConnected')} onPress={() => { setMenu(false); setConnSheet(true); }} />
              <ListRow left={<Icon name="refresh" size={20} />} title={t('reload')} onPress={() => { setMenu(false); webref.current?.reload(); }} />
              <ListRow
                left={<Icon name="home" size={20} />}
                title={t('browserPark')}
                subtitle={t('browserParkSub')}
                onPress={() => {
                  setMenu(false);
                  // L'onglet Explorer reste monté : la page reste vivante, sans rechargement.
                  useBrowserPresence.getState().park({ url: activeTab.url!, title: activeTab.title || activeTab.url! });
                  router.navigate('/home');
                }}
              />
              <Divider />
            </>
          ) : null}
          <ListRow left={<Icon name="security" size={20} />} title={t('connectedSitesTitle')} subtitle={t('connectedSitesSub')} onPress={() => { setMenu(false); router.push('/connected-sites'); }} />
          <ListRow left={<Icon name="walletconnect" size={20} />} title={t('browserConnectLink')} subtitle={t('browserConnectLinkSub')} onPress={() => { setMenu(false); setLinkSheet(true); }} />
          <ListRow left={<Icon name="add" size={20} />} title={t('newTab')} onPress={() => newTab(false)} />
          <ListRow left={<Icon name="incognito" size={20} />} title={t('privateTab')} subtitle={t('nothingRemembered')} onPress={() => newTab(true)} />
          <ListRow left={<Icon name="appearance" size={20} />} title={t('darkSites')} right={<Switch value={forceDark} onValueChange={(v) => { setForceDark(v); saveForceDark(v); }} />} />
          <ListRow left={<Icon name="search" size={20} />} title={t('searchEngine')} subtitle={ENGINES.find((e) => e.key === engine)?.label} onPress={() => { const i = ENGINES.findIndex((e) => e.key === engine); const n = ENGINES[(i + 1) % ENGINES.length].key; setEngine(n); saveEngine(n); }} />
          <ListRow left={<Icon name="history" size={20} />} title={t('history')} subtitle={t(isPluralOne(language, recents.length) ? 'browserSitesOne' : 'browserSitesOther').replace('{count}', String(recents.length))} onPress={() => { setMenu(false); goHome(); }} />
          <View style={{ height: space[3] }} />
          <ListRow
            left={<Icon name="broom" size={20} color={colors.danger} />}
            title={t('clearData')}
            subtitle={t('historyAndRememberedSites')}
            style={{ minHeight: 56 }}
            onPress={() => {
              setMenu(false);
              Alert.alert(t('clearDataConfirmTitle'), t('clearDataConfirmMsg'), [
                { text: t('cancel'), style: 'cancel' },
                {
                  text: t('clearData'),
                  style: 'destructive',
                  onPress: () => {
                    clearRecents();
                    applyRecents([]);
                    // Sites seulement MÉMORISÉS compris : ils se reconnectaient encore sans PIN.
                    const st = useDappActivity.getState();
                    knownSites(st.connections, st.remembered).forEach((c) => removeConnection(c.host));
                    connected.current.clear();
                    toast.success(t('dataCleared'));
                  },
                },
              ]);
            }}
          />
        </View>
      </Sheet>

      {/* Sécurité du site : appui sur le bouclier de la barre d'adresse */}
      <Sheet visible={shieldSheet} onClose={() => setShieldSheet(false)}>
        {origin && shield ? (() => {
          const entry = catalogEntry(origin);
          const verdict = dangerHosts[origin];
          const mimics = lookalikeOf(origin);
          const look = shieldLook(shield);
          const tone = shield === 'flagged' ? colors.danger : shield === 'verified' ? colors.up : colors.textSecondary;
          const goplusKey = !securityScan ? 'siteSecGoplusOff' : verdict === 'phishing' ? 'siteSecGoplusFlagged' : verdict === 'safe' ? 'siteSecGoplusClean' : 'siteSecGoplusUnknown';
          const row = (icon: React.ComponentProps<typeof Icon>['name'], color: string, title: string, body: string) => (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[3], paddingVertical: space[2] }}>
              <Icon name={icon} size={18} color={color} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="body" style={{ fontWeight: '600' }}>{title}</Text>
                <Text variant="caption" tone="secondary">{body}</Text>
              </View>
            </View>
          );
          return (
            <View style={{ gap: space[2] }}>
              <Text variant="title2">{t('siteSecurityTitle')}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[1] }}>
                <DappLogo host={origin} size={40} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="body" numberOfLines={1} style={{ fontWeight: '600' }}>{origin}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Icon name={look.icon} size={13} color={tone} />
                    <Text variant="caption" style={{ color: tone }}>{t(look.labelKey as never)}</Text>
                  </View>
                </View>
              </View>
              <Divider />
              {row(entry ? 'check' : 'info', entry ? colors.up : colors.textSecondary, t('siteSecCatalog'),
                entry ? `${fill(t('siteSecCatalogYes'), { name: entry.name })} · ${dappCompat(entry).map((c) => t(COMPAT_KEY[c] as never)).join(' · ')}` : t('siteSecCatalogNo'))}
              {row(verdict === 'phishing' ? 'warning' : 'security', verdict === 'phishing' ? colors.danger : verdict === 'safe' ? colors.textSecondary : colors.textTertiary, t('siteSecGoplus'), t(goplusKey as never))}
              {row(mimics ? 'warning' : 'checkmark', mimics ? colors.danger : colors.textSecondary, t('siteSecLookalikeTitle'),
                mimics ? fill(t('siteSecLookalike'), { name: mimics }) : t('siteSecNoLookalike'))}
              {securityScan && verdict !== 'safe' && verdict !== 'phishing' ? (
                <Button label={t('retry')} icon="refresh" variant="secondary" size="md" onPress={() => scanSite(origin)} />
              ) : null}
              <Text variant="caption" tone="tertiary">{t('siteSecNote')}</Text>
            </View>
          );
        })() : null}
      </Sheet>

      {/* Connexion par lien : WalletConnect ou TON Connect, la page reste ouverte */}
      <Sheet visible={linkSheet} onClose={() => setLinkSheet(false)}>
        <Text variant="title2">{t('browserConnectLink')}</Text>
        <Text variant="bodySecondary" tone="secondary">{t('browserConnectLinkHelp')}</Text>
        <Input value={linkText} onChangeText={setLinkText} placeholder="wc:… · tc://… · https://…ton-connect…" autoCapitalize="none" autoCorrect={false} />
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <View style={{ flex: 1 }}>
            <Button label={t('paste')} variant="secondary" onPress={async () => setLinkText((await Clipboard.getStringAsync()).trim())} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label={t('scanQr')} variant="secondary" onPress={() => { setLinkSheet(false); router.push('/scan'); }} />
          </View>
        </View>
        <Button
          label={t('connect')}
          loading={linkBusy}
          disabled={!linkText.trim()}
          onPress={async () => {
            const link = linkText.trim();
            setLinkBusy(true);
            try {
              if (looksLikeTonConnect(link)) {
                const err = await useTonConnect.getState().openLink(link);
                if (err) return toast.error(t('connectionFailed'), t(err as never));
              } else if (link.startsWith('wc:')) {
                await useWalletConnect.getState().pair(link);
              } else {
                return toast.error(t('invalidUri'), t('browserConnectLinkHelp'));
              }
              // La demande s'affiche par-dessus la page (fenêtres globales) : on ferme seulement cette feuille.
              setLinkText('');
              setLinkSheet(false);
            } catch (e) {
              toast.error(t('connectionFailed'), /expired/i.test(String(e)) ? t('linkExpiredBody') : t('linkUnusable'));
            } finally {
              setLinkBusy(false);
            }
          }}
        />
      </Sheet>

      {/* Rechercher dans la page */}
      <Sheet visible={findSheet} onClose={() => setFindSheet(false)}>
        <Text variant="title2">{t('searchInPage')}</Text>
        <Input autoFocus value={findQ} onChangeText={setFindQ} placeholder={t('textToFind')} onSubmitEditing={() => inject(`window.find(${JSON.stringify(findQ)}, false, false, true); true;`)} />
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <Button label={t('previous')} variant="secondary" size="md" style={{ flex: 1 }} onPress={() => inject(`window.find(${JSON.stringify(findQ)}, false, true, true); true;`)} />
                    <Button label={t('next')} size="md" style={{ flex: 1 }} onPress={() => inject(`window.find(${JSON.stringify(findQ)}, false, false, true); true;`)} />
        </View>
      </Sheet>

      {/* Connexion au site & réseau */}
      <Sheet visible={connSheet} onClose={() => setConnSheet(false)}>
        <Text variant="title2">{t('siteConnection')}</Text>
        {origin ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[2] }}>
            <DappLogo host={origin} size={40} />
            <View style={{ flex: 1 }}>
              <Text variant="body" style={{ fontWeight: '600' }}>{activeTab.title || origin}</Text>
              <Text variant="caption" tone="secondary">{origin} · {chain.name}</Text>
            </View>
          </View>
        ) : null}

        {siteConn ? (
          <Button
            label={t('disconnect')}
            variant="destructive"
            size="md"
            onPress={() => {
              if (origin) {
                removeConnection(origin);
                connected.current.delete(connKey(origin, false));
                connected.current.delete(connKey(origin, true));
                inject(emitJs('accountsChanged', []));
                inject(emitJs('disconnect', {}));
              }
              setConnSheet(false);
              toast.success(t('disconnected'), origin);
            }}
          />
        ) : null}

        <Divider />
        <Text variant="body" style={{ fontWeight: '600' }}>{t('chooseActiveNetwork')}</Text>
        <Input
          value={netQ}
          onChangeText={setNetQ}
          placeholder={t('searchNetwork')}
        />
        <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false}>
          {listChains({ includeTestnets: showTestnets })
            .filter((c) => c.family === 'evm' && (!netQ || c.name.toLowerCase().includes(netQ.toLowerCase())))
            .map((c) => {
              const on = c.id === (activeTab.chainId ?? activeChain);
              return (
                <ListRow
                  key={c.id}
                  left={<RemoteIcon uri={chainIconUrl(c.id)} label={c.name} size={24} />}
                  title={c.name}
                  right={on ? <Icon name="check" size={20} color={colors.text} /> : null}
                  onPress={() => {
                    updateTab(activeTab.id, { chainId: c.id });
                    setActiveChain(c.id);
                    if (c.evmChainId) {
                      inject(emitJs('chainChanged', '0x' + c.evmChainId.toString(16)));
                    }
                    setConnSheet(false);
                  }}
                />
              );
            })}
        </ScrollView>
      </Sheet>

      {/* Changement de réseau demandé par un site connecté */}
      <Sheet visible={!!switchReq} onClose={() => answerSwitch(false)}>
        {switchReq ? (() => {
          const target = listChains().find((c) => c.id === switchReq.targetId);
          return (
            <View style={{ gap: space[3] }}>
              <View style={{ alignItems: 'center', gap: space[2], paddingVertical: space[2] }}>
                <DappLogo host={switchReq.origin} size={48} />
                <Text variant="title2" style={{ textAlign: 'center' }}>{t('switchNetworkTitle')}</Text>
                <Text variant="caption" tone="secondary" style={{ textAlign: 'center' }}>{fill(t('switchNetworkBody'), { site: switchReq.origin, from: chain.name, to: target?.name ?? '' })}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: space[2] }}>
                <Button label={t('refuse')} variant="secondary" size="lg" style={{ flex: 1 }} onPress={() => answerSwitch(false)} />
                <Button label={t('switchNetworkConfirm')} size="lg" style={{ flex: 1 }} onPress={() => answerSwitch(true)} />
              </View>
            </View>
          );
        })() : null}
      </Sheet>

      {/* Demande de connexion EIP-1193 */}
      <Sheet visible={!!pending && pending.kind === 'connect' && !signConfirm} onClose={deny}>
        <View style={{ alignItems: 'center', gap: space[2], paddingVertical: space[2] }}>
          {pending?.origin ? <DappLogo host={pending.origin} size={56} /> : null}
          <Text variant="title2" style={{ textAlign: 'center' }}>{t('connectToSite')}</Text>
          <Text variant="caption" tone="secondary" style={{ textAlign: 'center' }}>{pending?.origin} · {chain.name}</Text>
        </View>

        {danger || phishSite ? (
          <View style={{ backgroundColor: colors.danger, padding: space[3], borderRadius: radius.container, borderWidth: 1, borderColor: colors.danger, gap: space[1] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
              <Icon name="warning" size={18} color={colors.text} />
              <Text variant="body" style={{ color: colors.text, fontWeight: '600' }}>{t('riskDetected')}</Text>
            </View>
          </View>
        ) : null}

        <Card style={{ padding: space[3], borderRadius: radius.container, gap: space[2] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}><Icon name="checkmark" size={14} color={colors.up} weight="bold" /><Text variant="caption" tone="secondary" style={{ flex: 1 }}>{t('canSeeAddress')}</Text></View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}><Icon name="checkmark" size={14} color={colors.up} weight="bold" /><Text variant="caption" tone="secondary" style={{ flex: 1 }}>{t('canProposeTx')}</Text></View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}><Icon name="lock" size={14} color={colors.textSecondary} weight="bold" /><Text variant="caption" tone="secondary" style={{ flex: 1 }}>{t('cannotMove')}</Text></View>
          <Divider />
          <Checkbox checked={rememberSite} onChange={setRememberSite} label={<Text variant="body">{t('rememberSite')}</Text>} />
        </Card>

        <View style={{ flexDirection: 'row', gap: space[2], marginTop: space[2] }}>
          <Button label={t('refuse')} variant="secondary" size="lg" style={{ flex: 1 }} onPress={deny} />
          <Button label={t('connect')} size="lg" style={{ flex: 1 }} onPress={() => setSignConfirm(true)} />
        </View>
      </Sheet>

      {/* Signature ou transaction */}
      <SignSheet
        visible={!!pending && pending.kind !== 'connect' && !signConfirm}
        peer={pending ? { name: activeTab.title || pending.origin, url: `https://${pending.origin}` } : null}
        // Coche « vérifié » réservée au catalogue : « non signalé » ne veut pas dire « sûr »
        // (analyse désactivée, échouée, ou site simplement inconnu).
        verify={danger || phishSite ? { validation: 'INVALID', isScam: true } : pending && VERIFIED_HOSTS.has(pending.origin) ? { validation: 'VALID' } : { validation: 'UNKNOWN' }}
        explanation={explanation}
        simulating={sim === 'loading'}
        network={chain.name}
        address={evmAddress}
        raw={
          pending?.kind === 'tx'
            ? JSON.stringify(pending.raw, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 2)
            : pending?.kind === 'sign'
            ? pending.text || pending.hex
            : pending?.kind === 'typedData'
            ? JSON.stringify(pending.data, null, 2)
            : undefined
        }
        onReject={deny}
        onSign={() => setSignConfirm(true)}
        signLabel={pending?.kind === 'tx' ? t('wcSignConfirm') : t('wcSign')}
      />

      {/* Confirmation par code PIN ou biométrie */}
      <ConfirmUnlock
        visible={signConfirm}
        title={explanation?.title ?? (pending?.kind === 'connect' ? t('connectToSite') : pending?.kind === 'tx' ? t('confirmTx') : t('wcSign'))}
        subtitle={explanation?.headline ?? pending?.origin}
        perform={perform}
        onDone={() => setSignConfirm(false)}
        onCancel={() => setSignConfirm(false)}
        aiContext={pending?.kind === 'tx' ? {
          to: pending.to ?? '',
          // Montant lisible : le modèle recevait des wei bruts (« 1000000000000000000 »).
          value: `${formatTokenAmount(pending.value, 18)} ${getAdapter(pending.chainId).config.nativeSymbol}`,
          method: explanation ? `eth_sendTransaction — ${explanation.title}: ${explanation.headline}` : 'eth_sendTransaction',
          network: getAdapter(pending.chainId).config.name,
          url: `https://${pending.origin}`,
        } : undefined}
      />
    </View>
  );
}
