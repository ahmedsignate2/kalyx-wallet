/**
 * Navigateur dApps intégré — style Chrome : multi-onglets, barre d'outils en bas
 * (retour / avancer / accueil / onglets / menu), sélecteur d'onglets, favoris,
 * historique. WebView + window.ethereum injecté (EIP-1193).
 *
 * SÉCURITÉ (inchangée) : la page ne voit JAMAIS de clé ; connexion par ORIGINE
 * (https), signatures décodées + PIN, origine non connectée → rejet.
 *
 * react-native-webview est natif : require dynamique (message clair sans rebuild).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, Text, TextInput, View, Image, Vibration, ScrollView, Share, useWindowDimensions, Animated, StyleSheet, KeyboardAvoidingView } from 'react-native';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassCard, ErrorBox, RemoteIcon } from '../ui/premium';
import { AuroraBackground } from '../ui/AuroraBackground';
import { TxPreview } from '../ui/TxPreview';
import { Button } from '../ui/components';
import { Icon } from '../ui/icon';
import { NovaLogo } from '../ui/NovaLogo';
import { fonts, radii, spacing, useTheme } from '../ui/theme';
import { duration, easing } from '../ui/motion';
import { haptic } from '../lib/haptics';
import { sound } from '../lib/sound';
import { useWallet, type Unlock } from '../lib/walletStore';
import { useSettings, useT } from '../lib/settingsStore';
import { toast } from '../lib/toast';
import { loadRecents, pushRecent, clearRecents, loadFavorites, toggleFavorite, type RecentDapp } from '../lib/recentDapps';
import { useDappActivity } from '../lib/dappActivity';
import { saveTabs, loadTabs } from '../lib/browserTabs';
import {
  buildInjectedProvider,
  parseDappMessage,
  respondJs,
  emitJs,
  rpcProxy,
  READONLY_METHODS,
  type DappRequest,
} from '../lib/dappProvider';
import {
  getAdapter,
  listChains,
  formatBalance,
  hexToText,
  parseSiwe,
  siweDomainMismatch,
  summarizeTypedData,
  assessAddress,
  isPhishingSite,
  isWalletError,
  chainIconUrl,
  type RawTxRequest,
  type RiskAssessment,
} from '../src';

// WebView = module natif : require dynamique pour ne pas crasher avant rebuild.
let WebViewComp: React.ComponentType<Record<string, unknown>> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  WebViewComp = require('react-native-webview').WebView;
} catch {
  WebViewComp = null;
}

/** Ref minimale d'une WebView (méthodes qu'on pilote). */
type WV = {
  injectJavaScript: (js: string) => void;
  goBack: () => void;
  goForward: () => void;
  reload: () => void;
  stopLoading: () => void;
};

/** dApps suggérées (page d'accueil). `domain` sert au logo (favicon HD). */
interface Dapp {
  name: string;
  url: string;
  domain: string;
  emoji: string;
  color: string;
}
const SUGGESTED: Dapp[] = [
  { name: 'Uniswap', url: 'https://app.uniswap.org', domain: 'uniswap.org', emoji: '🦄', color: '#FF007A' },
  { name: 'OpenSea', url: 'https://opensea.io', domain: 'opensea.io', emoji: '🌊', color: '#2081E2' },
  { name: 'Aave', url: 'https://app.aave.com', domain: 'aave.com', emoji: '👻', color: '#B6509E' },
  { name: 'Pancake', url: 'https://pancakeswap.finance', domain: 'pancakeswap.finance', emoji: '🥞', color: '#1FC7D4' },
  { name: 'Lido', url: 'https://stake.lido.fi', domain: 'lido.fi', emoji: '🌀', color: '#00A3FF' },
  { name: 'ENS', url: 'https://app.ens.domains', domain: 'ens.domains', emoji: '🏷️', color: '#5298FF' },
];

/** Collections NFT en vue (curatées, liens OpenSea) — tuiles emoji colorées. */
const COLLECTIONS: Dapp[] = [
  { name: 'Pudgy Penguins', url: 'https://opensea.io/collection/pudgypenguins', domain: '', emoji: '🐧', color: '#7CC6F0' },
  { name: 'Bored Apes', url: 'https://opensea.io/collection/boredapeyachtclub', domain: '', emoji: '🐵', color: '#E0A43B' },
  { name: 'Azuki', url: 'https://opensea.io/collection/azuki', domain: '', emoji: '⛩️', color: '#E85D75' },
  { name: 'Milady', url: 'https://opensea.io/collection/milady', domain: '', emoji: '🌸', color: '#F0A9C8' },
  { name: 'Moonbirds', url: 'https://opensea.io/collection/proof-moonbirds', domain: '', emoji: '🦉', color: '#6C5CE7' },
  { name: 'CloneX', url: 'https://opensea.io/collection/clonex', domain: '', emoji: '🧬', color: '#3AA0A0' },
];

/**
 * Logo d'un site : favicon PNG HD via Google (fiable et CARRÉ sous RN, contrairement
 * aux .ico DuckDuckGo qui s'affichaient étirés). Repli emoji/lettre au besoin.
 */
function faviconUrl(host: string): string {
  return `https://www.google.com/s2/favicons?domain=${host}&sz=128`;
}


/** Un onglet du navigateur. `url: null` = page d'accueil de l'onglet. */
interface Tab {
  id: string;
  url: string | null;
  input: string;
  title: string;
  canBack: boolean;
  canFwd: boolean;
}
let tabSeq = 0;
function mkTab(url: string | null = null): Tab {
  return { id: `t${Date.now().toString(36)}${(tabSeq++).toString(36)}`, url, input: url ?? '', title: '', canBack: false, canFwd: false };
}

/** Demande en attente d'approbation (rattachée à l'onglet émetteur). */
type Pending =
  | { kind: 'connect'; tabId: string; id: number; origin: string }
  | { kind: 'sign'; tabId: string; id: number; origin: string; text: string | null; siwe: ReturnType<typeof parseSiwe>; hex: string }
  | { kind: 'typedData'; tabId: string; id: number; origin: string; summary: ReturnType<typeof summarizeTypedData>; data: unknown }
  | { kind: 'tx'; tabId: string; id: number; origin: string; to?: string; value: bigint; dataBytes: number; raw: RawTxRequest };

function originOf(url: string): string {
  const m = url.match(/^https:\/\/([^/]+)/i);
  return m ? m[1].toLowerCase() : '';
}

/** Domaines dApp reconnus « sûrs » (racine). Base de l'indicateur vérifié. */
const KNOWN_SAFE = new Set<string>([
  'uniswap.org', 'opensea.io', 'aave.com', 'pancakeswap.finance', 'lido.fi', 'ens.domains',
  'app.uniswap.org', 'app.aave.com', 'stake.lido.fi', 'app.ens.domains',
  'coingecko.com', 'etherscan.io', 'polygon.technology', '1inch.io', 'curve.fi',
  'sushi.com', 'compound.finance', 'makerdao.com', 'rarible.com', 'blur.io', 'zapper.xyz',
]);
const SAFE_ROOTS = ['uniswap', 'opensea', 'aave', 'pancakeswap', 'lido', 'ens', 'curve', '1inch', 'compound', 'blur', 'rarible'];

function rootDomain(host: string): string {
  const parts = host.split('.');
  return parts.length > 2 ? parts.slice(-2).join('.') : host;
}
/** Distance d'édition ≤ 1 (typosquat « unniswap.org »). */
function nearlyEqual(a: string, b: string): boolean {
  if (a === b) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, diff = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++diff > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else { i++; j++; }
  }
  return true;
}

type SecLevel = 'safe' | 'suspicious' | 'unknown';
/** Heuristique anti-phishing locale (sans API) : vérifié / suspect / inconnu. */
function siteSecurity(host: string): SecLevel {
  if (!host) return 'unknown';
  const root = rootDomain(host);
  if (KNOWN_SAFE.has(host) || KNOWN_SAFE.has(root)) return 'safe';
  // Typosquat : ressemble à un domaine sûr sans en être un.
  for (const safe of KNOWN_SAFE) {
    if (nearlyEqual(root, safe) || nearlyEqual(host, safe)) return 'suspicious';
  }
  // Contient un nom de marque connu mais n'est pas son domaine (ex. uniswap-airdrop.com).
  for (const brand of SAFE_ROOTS) {
    if ((host.includes(brand) || host.includes(brand.replace(/[^a-z]/g, ''))) && !KNOWN_SAFE.has(root)) return 'suspicious';
  }
  return 'unknown';
}
function normalizeUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  return /^https:\/\//i.test(t) ? t : /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(t) ? `https://${t}` : null;
}

export default function Browser() {
  const { colors, typography, gradients } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  // 3 colonnes : largeur = (écran − marges − 2 gaps) / 3 (min 88 sur petit écran).
  const GAP = 12;
  const tileW = Math.max(88, Math.floor((screenW - spacing(2.5) * 2 - GAP * 2) / 3));
  const account = useWallet((s) => s.account);
  const activeChain = useWallet((s) => s.activeChain);
  const setActiveChain = useWallet((s) => s.setActiveChain);
  const biometricEnabled = useSettings((s) => s.biometricEnabled);
  const showTestnets = useSettings((s) => s.showTestnets);
  const chain = getAdapter(activeChain).config;
  const chainIdHex = '0x' + (chain.evmChainId ?? 1).toString(16);

  // Onglets (avec ref pour les handlers) + WebView refs par onglet.
  const [tabs, setTabsState] = useState<Tab[]>(() => [mkTab()]);
  const [activeId, setActiveIdState] = useState<string>(() => tabs[0].id);
  const [progress, setProgress] = useState(0); // progression de chargement de l'onglet actif
  const addressRef = useRef<TextInput>(null); // focus depuis la recherche de l'accueil
  // Barre d'adresse rétractable au scroll (façon Chrome/Edge mobile).
  const [barRowH, setBarRowH] = useState(0); // hauteur mesurée de la rangée d'adresse
  const barShown = useRef(new Animated.Value(1)).current; // 1 = visible, 0 = repliée
  const lastScrollY = useRef(0);
  const tabFade = useRef(new Animated.Value(1)).current; // fondu à l'ouverture/changement d'onglet
  const showBar = useCallback((to: 1 | 0) => {
    Animated.timing(barShown, { toValue: to, duration: 200, useNativeDriver: false }).start();
  }, [barShown]);
  const onWebScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    const y = e.nativeEvent.contentOffset.y;
    const dy = y - lastScrollY.current;
    lastScrollY.current = y;
    if (y < 60) showBar(1); // près du haut → toujours visible
    else if (dy > 8) showBar(0); // scroll vers le bas → replie
    else if (dy < -8) showBar(1); // scroll vers le haut → montre
  }, [showBar]);
  useEffect(() => {
    setProgress(0); // au changement d'onglet, on masque la barre (pas de progression live)
    barShown.setValue(1); // et on ré-affiche la barre d'adresse
    lastScrollY.current = 0;
    // Fondu doux du contenu (façon Safari) à chaque changement d'onglet.
    tabFade.setValue(0.4);
    Animated.timing(tabFade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [activeId, barShown, tabFade]);
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
  };
  const webrefs = useRef<Map<string, WV>>(new Map());
  const updateTab = (id: string, patch: Partial<Tab>) => setTabs((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const activeTab = tabs.find((t) => t.id === activeId) ?? tabs[0];
  const origin = activeTab?.url ? originOf(activeTab.url) : '';

  const connected = useRef<Set<string>>(new Set());
  const [pending, setPending] = useState<Pending | null>(null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [switcher, setSwitcher] = useState(false);
  const [menu, setMenu] = useState(false);
  const [rememberSite, setRememberSite] = useState(false); // case « se souvenir » (connexion)
  const [showAllHistory, setShowAllHistory] = useState(false);
  // Analyse de sécurité GoPlus de la demande en cours.
  const [risk, setRisk] = useState<RiskAssessment | 'loading' | null>(null);
  const [phishSite, setPhishSite] = useState(false);
  const [netSheet, setNetSheet] = useState(false); // sélecteur de réseau (badge)

  // Récents + favoris (persistés).
  const [recents, setRecents] = useState<RecentDapp[]>([]);
  const [favorites, setFavorites] = useState<RecentDapp[]>([]);
  const recentsRef = useRef<RecentDapp[]>([]);
  const favRef = useRef<RecentDapp[]>([]);
  const applyRecents = (list: RecentDapp[]) => {
    recentsRef.current = list;
    setRecents(list);
  };
  const applyFav = (list: RecentDapp[]) => {
    favRef.current = list;
    setFavorites(list);
  };
  const loadActivity = useDappActivity((s) => s.load);
  useEffect(() => {
    loadRecents().then(applyRecents);
    loadFavorites().then(applyFav);
    loadActivity();
    // Restaure les onglets ouverts de la session précédente.
    loadTabs().then((saved) => {
      if (!saved) return;
      const restored: Tab[] = saved.tabs.map((t) => ({ id: t.id, url: t.url, input: t.url ?? '', title: t.title, canBack: false, canFwd: false }));
      setTabs(restored);
      setActiveId(restored.some((t) => t.id === saved.activeId) ? saved.activeId : restored[0].id);
    });
  }, [loadActivity]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persiste les onglets (débounce pour coalescer les frappes dans l'URL).
  useEffect(() => {
    const h = setTimeout(() => saveTabs(tabs.map((t) => ({ id: t.id, url: t.url, title: t.title })), activeId), 500);
    return () => clearTimeout(h);
  }, [tabs, activeId]);

  const injected = useMemo(() => buildInjectedProvider(chainIdHex), [chainIdHex]);
  const isFav = !!origin && favorites.some((f) => f.host === origin);

  // Vibration + analyse GoPlus à l'apparition d'une demande.
  useEffect(() => {
    setRisk(null);
    setPhishSite(false);
    if (!pending) return;
    Vibration.vibrate(pending.kind === 'tx' ? [0, 30, 60, 30] : 12);
    // Module « Analyse de sécurité » désactivable (écran Extensions).
    if (!useSettings.getState().securityScan) return;
    const cid = chain.evmChainId ?? 1;
    if (pending.kind === 'tx' && pending.to) {
      setRisk('loading');
      assessAddress(cid, pending.to).then(r => { setRisk(r); if (r?.level === 'danger') haptic.warning(); }).catch(() => setRisk(null));
    } else if (pending.kind === 'typedData' && pending.summary?.verifyingContract) {
      setRisk('loading');
      assessAddress(cid, pending.summary.verifyingContract).then(r => { setRisk(r); if (r?.level === 'danger') haptic.warning(); }).catch(() => setRisk(null));
    } else if (pending.kind === 'connect') {
      isPhishingSite(`https://${pending.origin}`).then(r => { setPhishSite(r); if (r) haptic.warning(); }).catch(() => {});
    }
  }, [pending?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deep-link interne : /browser?url=https://…
  const { url: urlParam } = useLocalSearchParams<{ url?: string }>();
  useEffect(() => {
    const u = urlParam ? normalizeUrl(String(urlParam)) : null;
    if (u) updateTab(activeRef.current, { url: u, input: u });
  }, [urlParam]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Navigue l'onglet actif vers une URL (+ historique). */
  const go = (raw: string, title?: string) => {
    const t = raw.trim();
    if (!t) return;
    // Omnibox façon Chrome : URL si ça ressemble à un domaine, sinon Google.
    const u = normalizeUrl(t) ?? `https://www.google.com/search?q=${encodeURIComponent(t)}`;
    updateTab(activeRef.current, { url: u, input: u });
    const host = originOf(u);
    pushRecent({ url: u, host, title: title || host }, recentsRef.current).then(applyRecents);
    setSwitcher(false);
  };

  // --- Gestion des onglets ---
  const newTab = () => {
    const t = mkTab();
    setTabs((ts) => [...ts, t]);
    setActiveId(t.id);
    setSwitcher(false);
  };
  const closeTab = (id: string) => {
    webrefs.current.delete(id);
    const prev = tabsRef.current;
    const idx = prev.findIndex((t) => t.id === id);
    const next = prev.filter((t) => t.id !== id);
    if (next.length === 0) {
      const home = mkTab();
      setTabs([home]);
      setActiveId(home.id);
      return;
    }
    setTabs(next);
    if (id === activeRef.current) setActiveId(next[Math.min(idx, next.length - 1)].id);
  };
  const goHome = () => { barShown.setValue(1); updateTab(activeRef.current, { url: null, input: '' }); };

  const toggleCurrentFav = () => {
    if (!origin) return;
    Vibration.vibrate(10);
    toggleFavorite({ url: activeTab.url ?? `https://${origin}`, host: origin, title: activeTab.title || origin }, favRef.current).then((next) => {
      applyFav(next);
      toast.success(next.some((f) => f.host === origin) ? t('favAdded') : t('favRemoved'), origin);
    });
  };

  // --- Pont EIP-1193 (routé vers l'onglet émetteur) ---
  const inject = useCallback((tabId: string, js: string) => webrefs.current.get(tabId)?.injectJavaScript(js), []);
  const respond = useCallback(
    (tabId: string, id: number, result: unknown, err?: { code: number; message: string }) => inject(tabId, respondJs(id, result, err)),
    [inject],
  );
  const reject = useCallback(
    (tabId: string, id: number, code = 4001, message = 'Refusé par l’utilisateur') => respond(tabId, id, null, { code, message }),
    [respond],
  );

  const onDappRequest = useCallback(
    async (req: DappRequest, reqOrigin: string, tabId: string) => {
      const { id, method, params } = req;
      const addr = account?.address;
      const isConnected = connected.current.has(reqOrigin);

      try {
        if (method === 'eth_chainId') return respond(tabId, id, chainIdHex);
        if (method === 'net_version') return respond(tabId, id, String(chain.evmChainId ?? 1));
        if (method === 'eth_accounts') return respond(tabId, id, isConnected && addr ? [addr] : []);
        if (method === 'wallet_getPermissions') return respond(tabId, id, isConnected ? [{ parentCapability: 'eth_accounts' }] : []);

        if (method === 'eth_requestAccounts' || method === 'wallet_requestPermissions') {
          if (isConnected && addr) {
            return respond(tabId, id, method === 'eth_requestAccounts' ? [addr] : [{ parentCapability: 'eth_accounts' }]);
          }
          // Site « de confiance » (case « se souvenir ») → reconnexion SILENCIEUSE.
          if (addr && useDappActivity.getState().isRemembered(reqOrigin)) {
            connected.current.add(reqOrigin);
            inject(tabId, emitJs('accountsChanged', [addr]));
            inject(tabId, emitJs('connect', { chainId: chainIdHex }));
            useDappActivity.getState().addConnection({ host: reqOrigin, url: `https://${reqOrigin}`, title: reqOrigin });
            return respond(tabId, id, method === 'eth_requestAccounts' ? [addr] : [{ parentCapability: 'eth_accounts' }]);
          }
          setPending({ kind: 'connect', tabId, id, origin: reqOrigin });
          return;
        }

        if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') {
          const want = Number((params[0] as { chainId?: string })?.chainId ?? '0x0');
          const target = listChains().find((c) => c.family === 'evm' && c.evmChainId === want);
          if (!target) return respond(tabId, id, null, { code: 4902, message: 'Réseau non supporté par Nova' });
          setActiveChain(target.id);
          respond(tabId, id, null);
          inject(tabId, emitJs('chainChanged', '0x' + want.toString(16)));
          return;
        }

        const isSigning =
          method === 'personal_sign' || method === 'eth_sign' || method.startsWith('eth_signTypedData') || method === 'eth_sendTransaction';
        if (isSigning) {
          if (!isConnected || !addr) return respond(tabId, id, null, { code: 4100, message: 'Non connecté' });
          if (method === 'personal_sign' || method === 'eth_sign') {
            const hex = String(method === 'personal_sign' ? params[0] : params[1] ?? '');
            const text = hexToText(hex) ?? (hex.startsWith('0x') ? null : hex);
            setPending({ kind: 'sign', tabId, id, origin: reqOrigin, hex, text, siwe: text ? parseSiwe(text) : null });
            return;
          }
          if (method.startsWith('eth_signTypedData')) {
            const rawData = params[1];
            const data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
            setPending({ kind: 'typedData', tabId, id, origin: reqOrigin, data, summary: summarizeTypedData(data) });
            return;
          }
          const tx = (params[0] ?? {}) as { to?: string; value?: string; data?: string; gas?: string };
          if (!tx.to) return respond(tabId, id, null, { code: 4200, message: 'Déploiement de contrat non supporté' });
          const raw: RawTxRequest = {
            to: tx.to,
            data: tx.data ?? '0x',
            value: tx.value ? BigInt(tx.value) : 0n,
            chainId: chain.evmChainId!,
            gasLimit: tx.gas ? BigInt(tx.gas) : undefined,
          };
          setPending({ kind: 'tx', tabId, id, origin: reqOrigin, to: tx.to, value: raw.value ?? 0n, dataBytes: typeof tx.data === 'string' ? Math.max(0, (tx.data.length - 2) / 2) : 0, raw });
          return;
        }

        if (READONLY_METHODS.has(method)) {
          const result = await rpcProxy(chain.rpcUrls, method, params);
          return respond(tabId, id, result);
        }

        respond(tabId, id, null, { code: -32601, message: `Méthode non supportée : ${method}` });
      } catch (e) {
        respond(tabId, id, null, { code: -32603, message: e instanceof Error ? e.message.slice(0, 160) : 'Erreur interne' });
      }
    },
    [account?.address, chain, chainIdHex, respond, inject, setActiveChain],
  );

  // Exécute l'action (connexion/signature/tx) avec biométrie OU PIN. LÈVE en cas
  // d'échec (le prompt biométrique annulé lève → repli PIN géré par les appelants).
  const perform = async (unlock: Unlock) => {
    if (!pending || !account) return;
    setError(null);
    const activity = useDappActivity.getState();
    setBusy(true);
    try {
      if (pending.kind === 'connect') {
        await useWallet.getState().verifyUnlock(unlock); // lève si refusé
        connected.current.add(pending.origin);
        respond(pending.tabId, pending.id, [account.address]);
        inject(pending.tabId, emitJs('accountsChanged', [account.address]));
        inject(pending.tabId, emitJs('connect', { chainId: chainIdHex }));
        activity.addConnection({ host: pending.origin, url: `https://${pending.origin}`, title: activeTab?.title || pending.origin });
        if (rememberSite) activity.remember(pending.origin); // reconnexion sans PIN ensuite
        Vibration.vibrate(14);
        toast.success(t('connectionSuccess'), pending.origin);
      } else {
        const w = useWallet.getState();
        let result: string;
        if (pending.kind === 'sign') result = await w.signMessage(unlock, pending.hex);
        else if (pending.kind === 'typedData') result = await w.signTypedData(unlock, pending.data as Parameters<typeof w.signTypedData>[1]);
        else result = await w.sendRawTxOn(unlock, activeChain, pending.raw);
        respond(pending.tabId, pending.id, result);
        activity.addSignature({ host: pending.origin, kind: pending.kind === 'tx' ? 'tx' : pending.kind === 'typedData' ? 'typedData' : 'sign' });
        Vibration.vibrate(14);
        sound.success();
        toast.success(pending.kind === 'tx' ? t('transferSent') : t('messageSigned'), pending.origin);
      }
      setPending(null);
      setPin('');
      setRememberSite(false);
    } finally {
      setBusy(false);
    }
  };

  // Validation par PIN (repli) : gère l'erreur à l'écran plutôt que de lever.
  const submitPin = async () => {
    if (pin.length < 6) {
      setError(t('enterPinConfirm'));
      return;
    }
    try {
      await perform({ pin });
    } catch (e) {
      setError(isWalletError(e) && e.code === 'WRONG_PIN' ? t('pinIncorrect') : e instanceof Error ? e.message : t('actionFailed'));
    }
  };

  // Biométrie AUTO à l'ouverture d'une demande (si activée) ; annulation = PIN.
  useEffect(() => {
    if (!pending || !biometricEnabled) return;
    void perform({ biometric: true }).catch(() => {
      /* annulée / non configurée → l'utilisateur saisit son PIN */
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending?.id]);

  const deny = () => {
    if (pending) reject(pending.tabId, pending.id);
    setPending(null);
    setPin('');
    setError(null);
    setRememberSite(false);
  };

  // ------------------------------------------------------------------ UI

  if (!WebViewComp) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bgDeep, padding: spacing(2.5), justifyContent: 'center' }}>
        <Stack.Screen options={{ headerShown: true, title: t('browserTitle') }} />
        <GlassCard>
          <Text style={typography.bodyStrong}>{t('browserUnavailable')}</Text>
          <Text style={[typography.muted, { marginTop: spacing(1) }]}>
            {t('webviewMissing')}
          </Text>
        </GlassCard>
      </View>
    );
  }

  const WebViewAny = WebViewComp as React.ComponentType<Record<string, unknown>>;

  const sec = siteSecurity(origin);
  const secColor = sec === 'safe' ? colors.up : sec === 'suspicious' ? colors.danger : colors.textMuted;

  /** Écran d'accueil dApps (grille 3 colonnes) — rendu par chaque onglet vide. */
  const renderHome = () => (
   <View style={{ flex: 1 }}>
    {/* Fond premium : dégradé d'écran + aurora animée (façon Chrome/Edge new-tab). */}
    <LinearGradient colors={gradients.screen} style={StyleSheet.absoluteFill} />
    <AuroraBackground intensity={0.7} />
    {/* Logo Nova en filigrane discret, en fond de l'accueil du navigateur. */}
    <View pointerEvents="none" style={{ position: 'absolute', top: spacing(6), left: 0, right: 0, alignItems: 'center', opacity: 0.05 }}>
      <NovaLogo size={280} />
    </View>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing(2.5), gap: spacing(2.5), paddingBottom: spacing(6) }} showsVerticalScrollIndicator={false}>
      {/* Hero façon new-tab : titre + grande barre de recherche qui focus la barre d'adresse. */}
      <View style={{ alignItems: 'center', gap: spacing(1.5), marginTop: spacing(2), marginBottom: spacing(0.5) }}>
        <Text style={{ color: colors.text, fontSize: 26, fontFamily: fonts.extrabold, letterSpacing: 0.3 }}>{t('exploreWeb3')}</Text>
        <Text style={[typography.muted, { textAlign: 'center' }]}>{t('connectDappsHint')}</Text>
        <Pressable
          onPress={() => addressRef.current?.focus()}
          style={({ pressed }) => ({
            flexDirection: 'row', alignItems: 'center', gap: spacing(1.25), alignSelf: 'stretch',
            backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder,
            borderRadius: radii.pill, paddingHorizontal: spacing(2), paddingVertical: spacing(1.5),
            marginTop: spacing(1), opacity: pressed ? 0.8 : 1,
            shadowColor: colors.accent, shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 4,
          })}
        >
          <Icon name="search" size={18} color={colors.accent} />
          <Text style={{ color: colors.textMuted, fontSize: 15, flex: 1 }}>{t('searchOrUrl')}</Text>
          <Icon name="scan" size={18} color={colors.textMuted} />
        </Pressable>
      </View>

      {favorites.length > 0 ? (
        <View style={{ gap: spacing(1.25) }}>
          <SectionTitle>{t('favorites')}</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: GAP, rowGap: 16 }}>
            {favorites.map((f) => (
              <Tile key={f.host} width={tileW} host={f.host} name={f.title || f.host} color={colors.glassStrong} onPress={() => go(f.url, f.title)} />
            ))}
          </View>
        </View>
      ) : null}

      <View style={{ gap: spacing(1.25) }}>
        <SectionTitle>{t('popularSites')}</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: GAP, rowGap: 16 }}>
          {SUGGESTED.map((d) => (
            <Tile key={d.url} width={tileW} host={d.domain} name={d.name} color={d.color} emoji={d.emoji} onPress={() => go(d.url, d.name)} />
          ))}
        </View>
      </View>

      <View style={{ gap: spacing(1.25) }}>
        <SectionTitle>{t('trendingCollections')}</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: GAP, rowGap: 16 }}>
          {COLLECTIONS.map((d) => (
            <Tile key={d.url} width={tileW} host={d.domain} name={d.name} color={d.color} emoji={d.emoji} onPress={() => go(d.url, d.name)} />
          ))}
        </View>
      </View>

      {recents.length > 0 ? (
        <View style={{ gap: spacing(1) }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name="history" size={18} color={colors.textMuted} />
              <Text style={typography.section}>{t('historyTitle')}</Text>
            </View>
            <Pressable onPress={() => { clearRecents(); applyRecents([]); }} hitSlop={8}>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>{t('clearWord')}</Text>
            </Pressable>
          </View>
          <GlassCard>
            {recents.slice(0, showAllHistory ? 50 : 5).map((r, i) => (
              <Pressable key={r.host} onPress={() => go(r.url, r.title)} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), paddingVertical: spacing(1.25), borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.glassBorder }}>
                <Favicon host={r.host} size={30} color={colors.glassStrong} label={r.host.slice(0, 1).toUpperCase()} />
                <View style={{ flex: 1 }}>
                  <Text style={typography.bodyStrong} numberOfLines={1}>{r.title}</Text>
                  <Text style={typography.muted} numberOfLines={1}>{r.host}</Text>
                </View>
                <Icon name="chevron" size={16} tone="faint" />
              </Pressable>
            ))}
          </GlassCard>
          {recents.length > 5 ? (
            <Pressable onPress={() => setShowAllHistory((v) => !v)} hitSlop={8} style={{ alignSelf: 'center', paddingVertical: spacing(0.5) }}>
              <Text style={{ color: colors.accent, fontFamily: fonts.semibold, fontSize: 13 }}>
                {showAllHistory ? t('collapse') : `${t('viewAllWord')} (${recents.length})`}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
   </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgDeep }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Zone status-bar FIXE (ne se replie jamais) */}
      <View style={{ height: insets.top, backgroundColor: colors.bgDeep }} />

      {/* Barre d'adresse + badge réseau — RÉTRACTABLE au scroll (hauteur animée) */}
      <Animated.View style={{ height: barRowH ? Animated.multiply(barShown, barRowH) : undefined, overflow: 'hidden' }}>
      <View
        onLayout={(e) => { if (!barRowH) setBarRowH(e.nativeEvent.layout.height); }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1), paddingHorizontal: spacing(1.5), paddingTop: spacing(1), paddingBottom: spacing(1) }}
      >
        <Pressable
          onPress={() => setNetSheet(true)}
          hitSlop={6}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radii.pill, paddingHorizontal: spacing(1), paddingVertical: spacing(0.85), opacity: pressed ? 0.6 : 1 })}
        >
          <RemoteIcon uri={chainIconUrl(chain.id)} label={chain.name} size={18} />
          <Text style={{ color: colors.text, fontSize: 12, fontFamily: fonts.semibold, maxWidth: 74 }} numberOfLines={1}>{chain.name}</Text>
          <Icon name="chevron" size={12} tone="muted" />
        </Pressable>
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing(0.75),
            backgroundColor: colors.glass,
            borderWidth: 1,
            borderColor: colors.glassBorder,
            borderRadius: radii.pill,
            paddingHorizontal: spacing(1.5),
          }}
        >
          {/* Favicon du site + indicateur de sécurité (vert vérifié / rouge suspect) */}
          {activeTab?.url ? (
            <Favicon host={origin} size={18} color={colors.glassStrong} label={origin.slice(0, 1).toUpperCase()} />
          ) : (
            <Icon name="search" size={14} tone="muted" />
          )}
          {activeTab?.url ? (
            <SiteBadge sec={sec} />
          ) : null}
          <TextInput
            ref={addressRef}
            value={activeTab?.input ?? ''}
            onChangeText={(v) => updateTab(activeId, { input: v })}
            onSubmitEditing={() => go(activeTab?.input ?? '')}
            placeholder={t('searchGoogleOrUrl')}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            selectTextOnFocus
            clearButtonMode="while-editing"
            style={{ flex: 1, color: colors.text, fontSize: 14, paddingVertical: spacing(1) }}
          />
          <Pressable onPress={() => router.push('/scan')} hitSlop={8}>
            <Icon name="scan" size={16} color={colors.textMuted} />
          </Pressable>
          {activeTab?.url ? (
            <>
              <Pressable onPress={toggleCurrentFav} hitSlop={8}>
                <Icon name={isFav ? 'starFilled' : 'star'} size={17} color={isFav ? colors.warning : colors.textMuted} />
              </Pressable>
              {progress > 0 && progress < 1 ? (
                <Pressable onPress={() => (webrefs.current.get(activeId) as WV | undefined)?.stopLoading()} hitSlop={8}>
                  <Icon name="close" size={17} tone="muted" />
                </Pressable>
              ) : (
                <Pressable onPress={() => (webrefs.current.get(activeId) as WV | undefined)?.reload()} hitSlop={8}>
                  <Icon name="refresh" size={16} tone="muted" />
                </Pressable>
              )}
            </>
          ) : null}
        </View>
      </View>
      </Animated.View>

      {/* Barre de progression de chargement (façon Safari/Chrome) */}
      <LoadBar progress={activeTab?.url ? progress : 0} />

      {/* Bandeau anti-phishing : le domaine imite peut-être une marque connue */}
      {sec === 'suspicious' && activeTab?.url ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1), marginHorizontal: spacing(1.5), marginBottom: spacing(1), backgroundColor: colors.danger + '1E', borderWidth: 1, borderColor: colors.danger + '66', borderRadius: radii.md, paddingVertical: spacing(1), paddingHorizontal: spacing(1.5) }}>
          <Icon name="warning" size={16} color={colors.danger} />
          <Text style={{ color: colors.text, flex: 1, fontSize: 12.5 }}>{t('suspiciousDomainBanner')}</Text>
        </View>
      ) : null}

      {/* Corps : un conteneur plein écran PAR onglet (layout identique), l'actif
          visible. Chaque onglet montre soit sa WebView, soit l'accueil dApps. */}
      <Animated.View style={{ flex: 1, opacity: tabFade }}>
        {tabs.map((t) => (
          <View key={t.id} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: t.id === activeId ? 'flex' : 'none' }}>
            {t.url ? (
              <WebViewAny
                ref={(r: WV | null) => {
                  if (r) webrefs.current.set(t.id, r);
                  else webrefs.current.delete(t.id);
                }}
                source={{ uri: t.url }}
                originWhitelist={['https://*']}
                onLoadProgress={(e: { nativeEvent: { progress: number } }) => {
                  if (t.id === activeId) setProgress(e.nativeEvent.progress);
                }}
                onScroll={(e: { nativeEvent: { contentOffset: { y: number } } }) => {
                  if (t.id === activeId) onWebScroll(e);
                }}
                injectedJavaScriptBeforeContentLoaded={injected}
                onMessage={(e: { nativeEvent: { data: string; url?: string } }) => {
                  const req = parseDappMessage(e.nativeEvent.data);
                  if (req) onDappRequest(req, originOf(e.nativeEvent.url ?? t.url ?? ''), t.id);
                }}
                onNavigationStateChange={(nav: { url: string; title?: string; canGoBack: boolean; canGoForward: boolean }) => {
                  updateTab(t.id, { input: nav.url, url: nav.url, title: nav.title ?? '', canBack: nav.canGoBack, canFwd: nav.canGoForward });
                  const host = originOf(nav.url);
                  const top = recentsRef.current[0];
                  if (host && nav.title && !(top && top.host === host && top.title === nav.title)) {
                    pushRecent({ url: nav.url, host, title: nav.title }, recentsRef.current).then(applyRecents);
                  }
                }}
                allowsBackForwardNavigationGestures
                setSupportMultipleWindows={false}
                style={{ flex: 1, backgroundColor: colors.bgDeep }}
              />
            ) : (
              renderHome()
            )}
          </View>
        ))}
      </Animated.View>

      {/* Barre d'outils bas façon Chrome : retour / avancer / accueil / onglets / menu.
          Ombre vers le haut → effet « barre flottante » premium. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: spacing(1), paddingTop: spacing(1), paddingBottom: insets.bottom || spacing(1), borderTopWidth: 1, borderTopColor: colors.glassBorder, backgroundColor: colors.bg, shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 12, shadowOffset: { width: 0, height: -3 }, elevation: 12 }}>
        <ToolBtn icon="chevron" flip dim={!activeTab?.canBack} onPress={() => (webrefs.current.get(activeId) as WV | undefined)?.goBack()} />
        <ToolBtn icon="forward" dim={!activeTab?.canFwd} onPress={() => (webrefs.current.get(activeId) as WV | undefined)?.goForward()} />
        <ToolBtn icon="home" onPress={goHome} />
        {/* Compteur d'onglets (carré, accentué s'il y en a plusieurs) → sélecteur */}
        <Pressable onPress={() => setSwitcher(true)} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, alignItems: 'center', justifyContent: 'center' })}>
          <View style={{ width: 25, height: 25, borderRadius: 8, borderWidth: 2, borderColor: tabs.length > 1 ? colors.accent : colors.text, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: tabs.length > 1 ? colors.accent : colors.text, fontSize: 12, fontFamily: fonts.bold }}>{tabs.length}</Text>
          </View>
        </Pressable>
        <ToolBtn icon="more" onPress={() => setMenu(true)} />
      </View>

      {/* Sélecteur d'onglets */}
      <Modal visible={switcher} transparent animationType="slide" onRequestClose={() => setSwitcher(false)}>
        <View style={{ flex: 1, backgroundColor: colors.bgDeep, paddingTop: insets.top + spacing(1) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing(2.5), paddingVertical: spacing(1.5) }}>
            <Text style={typography.title}>{t('tabsWord')} ({tabs.length})</Text>
            <Pressable onPress={() => setSwitcher(false)} hitSlop={8}>
              <Text style={{ color: colors.accent, fontFamily: fonts.semibold }}>OK</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1.5), padding: spacing(2.5), paddingTop: 0 }}>
            
            {tabs.map((tb, i) => {
              const host = tb.url ? originOf(tb.url) : '';
              return (
                <AnimatedTab key={tb.id} index={i} tb={tb} active={tb.id === activeId} host={host} onPress={() => { setActiveId(tb.id); setSwitcher(false); }} onClose={() => closeTab(tb.id)} />
              );
            })}
            <AnimatedTab index={tabs.length} isNew onPress={newTab} />

          </ScrollView>
        </View>
      </Modal>

      {/* Menu (⋮) façon Chrome */}
      <Modal visible={menu} transparent animationType="slide" onRequestClose={() => setMenu(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} onPress={() => setMenu(false)}>
          <Pressable style={{ backgroundColor: colors.bgDeep, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: spacing(2), paddingBottom: insets.bottom + spacing(2) }}>
            <MenuRow icon="add" label={t('newTabLabel')} onPress={() => { setMenu(false); newTab(); }} />
            {activeTab?.url ? <MenuRow icon="refresh" label={t('refreshLabel')} onPress={() => { setMenu(false); (webrefs.current.get(activeId) as WV | undefined)?.reload(); }} /> : null}
            {activeTab?.url ? <MenuRow icon={isFav ? 'starFilled' : 'star'} label={isFav ? t('removeFav') : t('addFav')} onPress={() => { setMenu(false); toggleCurrentFav(); }} /> : null}
            {activeTab?.url ? <MenuRow icon="share" label={t('shareLabel')} onPress={() => { setMenu(false); Share.share({ message: activeTab.url! }).catch(() => {}); }} /> : null}
            <MenuRow icon="home" label={t('homePage')} onPress={() => { setMenu(false); goHome(); }} />
            <MenuRow icon="close" label={t('closeTabLabel')} onPress={() => { setMenu(false); closeTab(activeId); }} />
            <MenuRow icon="history" label={t('clearHistory')} onPress={() => { setMenu(false); clearRecents(); applyRecents([]); toast.info(t('historyCleared')); }} />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Sélecteur de réseau (badge) + adresse du wallet */}
      <Modal visible={netSheet} transparent animationType="slide" onRequestClose={() => setNetSheet(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} onPress={() => setNetSheet(false)}>
          <Pressable style={{ backgroundColor: colors.bgDeep, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: spacing(2.5), paddingBottom: insets.bottom + spacing(2), gap: spacing(1.5), overflow: 'hidden' }}>
            <LinearGradient colors={gradients.card} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            {/* Poignée de glissement (façon bottom-sheet natif) */}
            <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.glassBorder, marginBottom: spacing(0.5) }} />
            <Text style={typography.title}>{t('network')}</Text>
            {account ? (
              <Pressable
                onPress={() => { Clipboard.setStringAsync(account.address); toast.success(t('addressCopied')); }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1), backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radii.md, padding: spacing(1.25) }}
              >
                <Icon name="wallet" size={16} color={colors.textMuted} />
                <Text style={{ color: colors.text, flex: 1, fontFamily: fonts.medium, fontVariant: ['tabular-nums'] }}>
                  {account.address.slice(0, 8)}…{account.address.slice(-6)}
                </Text>
                <Icon name="copy" size={15} tone="muted" />
              </Pressable>
            ) : null}
            <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ gap: spacing(0.5) }} showsVerticalScrollIndicator={false}>
              {listChains({ includeTestnets: showTestnets }).filter((c) => c.family === 'evm').map((c) => {
                const on = c.id === activeChain;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => {
                      setActiveChain(c.id);
                      if (activeTab?.url) inject(activeId, emitJs('chainChanged', '0x' + (c.evmChainId ?? 1).toString(16)));
                      setNetSheet(false);
                    }}
                    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing(1.25), paddingVertical: spacing(1), paddingHorizontal: spacing(1), borderRadius: radii.md, backgroundColor: on ? colors.glass : pressed ? colors.glass : 'transparent' })}
                  >
                    <RemoteIcon uri={chainIconUrl(c.id)} label={c.name} size={30} />
                    <Text style={[typography.body, { flex: 1, color: on ? colors.accent : colors.text, fontFamily: fonts.semibold }]} numberOfLines={1}>{c.name}</Text>
                    {on ? <Icon name="check" size={18} color={colors.accent} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Fenêtre d'approbation (connexion / signature / transaction) */}
      {pending ? (
        <Modal transparent animationType="slide" onRequestClose={deny}>
          <KeyboardAvoidingView style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }} behavior="padding">
            <View style={{ backgroundColor: colors.bgDeep, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: spacing(2.5), paddingBottom: spacing(4), gap: spacing(1.5) }}>
              <Text style={typography.title}>
                {pending.kind === 'connect' ? t('connectToSite') : pending.kind === 'tx' ? t('txRequested') : t('signatureRequested')}
              </Text>

              <GlassCard>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
                  <Favicon host={pending.origin} size={44} color={colors.glassStrong} label={pending.origin.slice(0, 1).toUpperCase()} />
                  <View style={{ flex: 1 }}>
                    <Text style={typography.bodyStrong} numberOfLines={1}>{activeTab?.title || pending.origin}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <RemoteIcon uri={chainIconUrl(chain.id)} label={chain.name} size={16} />
                      <Text style={typography.muted}>{pending.origin} · {chain.name}</Text>
                    </View>
                  </View>
                </View>
              </GlassCard>

              {/* Analyse de sécurité GoPlus */}
              {phishSite ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1), backgroundColor: colors.danger + '1E', borderWidth: 1, borderColor: colors.danger + '66', borderRadius: radii.md, padding: spacing(1.5) }}>
                  <Icon name="warning" size={18} color={colors.danger} />
                  <Text style={{ color: colors.text, flex: 1, fontSize: 13 }}>{t('phishingWarning')}</Text>
                </View>
              ) : null}
              {risk === 'loading' ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1) }}>
                  <Icon name="security" size={15} color={colors.textMuted} />
                  <Text style={typography.muted}>{t('securityScanning')}</Text>
                </View>
              ) : risk && risk.level === 'danger' ? (
                <View style={{ backgroundColor: colors.danger + '1E', borderWidth: 1, borderColor: colors.danger + '66', borderRadius: radii.md, padding: spacing(1.5), gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1) }}>
                    <Icon name="warning" size={18} color={colors.danger} />
                    <Text style={{ color: colors.danger, fontFamily: fonts.bold, flex: 1 }}>{t('riskDetected')}</Text>
                  </View>
                  {risk.reasons.map((r) => (
                    <Text key={r} style={{ color: colors.text, fontSize: 13 }}>• {r}</Text>
                  ))}
                </View>
              ) : risk && risk.level === 'ok' ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1) }}>
                  <Icon name="check" size={15} color={colors.up} />
                  <Text style={{ color: colors.up, fontSize: 13, fontFamily: fonts.semibold }}>{t('noKnownRisk')}</Text>
                </View>
              ) : null}

              {pending.kind === 'connect' ? (
                <GlassCard>
                  <Text style={typography.muted}>{t('canSeeAddress')}</Text>
                  <Text style={typography.muted}>{t('canProposeTx')}</Text>
                  <Text style={typography.muted}>{t('cannotMove')}</Text>
                  <Text style={[typography.muted, { marginTop: spacing(1) }]}>{t('pinRequiredConnect')}</Text>
                  {/* Se souvenir : reconnexion sans PIN les prochaines fois */}
                  <Pressable onPress={() => setRememberSite((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1), marginTop: spacing(1.25) }}>
                    <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: rememberSite ? colors.accent : colors.glassBorder, backgroundColor: rememberSite ? colors.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {rememberSite ? <Icon name="check" size={14} color="#fff" /> : null}
                    </View>
                    <Text style={{ color: colors.text, flex: 1, fontSize: 14 }}>{t('rememberSite')}</Text>
                  </Pressable>
                </GlassCard>
              ) : pending.kind === 'sign' ? (
                <GlassCard>
                  {pending.siwe ? (
                    <>
                      <Text style={typography.bodyStrong}>{t('signInTo').replace('{domain}', pending.siwe.domain)}</Text>
                      {siweDomainMismatch(pending.siwe.domain, `https://${pending.origin}`) ? (
                        <ErrorBox message={t('siweMismatch').replace('{a}', pending.siwe.domain).replace('{b}', pending.origin)} />
                      ) : (
                        <>
                          <Text style={[typography.muted, { marginTop: spacing(0.5) }]}>{t('provesOwnership')}</Text>
                          <FreeSignature />
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <Text style={typography.muted}>{t('messageToSign')}</Text>
                      <Text style={[typography.bodyStrong, { fontSize: 14, marginTop: spacing(0.5) }]} numberOfLines={8} selectable>
                        {pending.text ?? t('binaryMessage')}
                      </Text>
                    </>
                  )}
                  <FreeSignature />
                </GlassCard>
              ) : pending.kind === 'typedData' ? (
                <GlassCard>
                  <Text style={typography.bodyStrong}>{pending.summary?.name ?? t('structuredData')}</Text>
                  {pending.summary?.primaryType ? <Text style={typography.muted}>{t('typeWord')} : {pending.summary.primaryType}</Text> : null}
                  {pending.summary?.details?.map((d) => {
                    const danger = d.value.includes('⚠️');
                    const val = d.value.length > 24 && d.value.startsWith('0x') ? `${d.value.slice(0, 8)}…${d.value.slice(-6)}` : d.value;
                    return (
                      <View key={d.label} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing(1), marginTop: 2 }}>
                        <Text style={typography.muted}>{d.label}</Text>
                        <Text style={[typography.bodyStrong, { color: danger ? colors.danger : colors.text, flexShrink: 1, textAlign: 'right' }]}>{val}</Text>
                      </View>
                    );
                  })}
                  <Text style={[typography.muted, { marginTop: spacing(1) }]}>
                    {pending.summary?.primaryType === 'Permit' || pending.summary?.details?.length ? t('permitWarning') : t('verifyBeforeSign')}
                  </Text>
                  <FreeSignature />
                </GlassCard>
              ) : (
                <GlassCard>
                  <TxPreview tx={pending.raw} chain={chain} />
                </GlassCard>
              )}

              <GlassCard>
                <Text style={typography.muted}>{t('pinLabel')}{biometricEnabled ? t('orBiometryBelow') : ''}</Text>
                <TextInput value={pin} onChangeText={setPin} keyboardType="number-pad" secureTextEntry maxLength={12} editable={!busy} style={{ color: colors.text, fontSize: 20, letterSpacing: 6 }} />
                {biometricEnabled ? (
                  <Pressable
                    onPress={() => { void perform({ biometric: true }).catch(() => {}); }}
                    disabled={busy}
                    hitSlop={8}
                    style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 8, marginTop: spacing(1), paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder }}
                  >
                    <Icon name="security" size={16} color={colors.accent} />
                    <Text style={{ color: colors.accent, fontSize: 13, fontFamily: fonts.semibold }}>{t('useBiometry')}</Text>
                  </Pressable>
                ) : null}
              </GlassCard>

              {error ? <ErrorBox message={error} /> : null}
              <View style={{ flexDirection: 'row', gap: spacing(1.5) }}>
                <View style={{ flex: 1 }}><Button label={t('refuse')} variant="ghost" onPress={deny} /></View>
                <View style={{ flex: 1 }}><Button label={busy ? t('signing') : pending.kind === 'connect' ? t('connect') : t('sign')} loading={busy} onPress={submitPin} /></View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      ) : null}
    </View>
  );
}

/** Bouton de la barre d'outils (icône, désactivable, chevron « flip » = retour). */
function ToolBtn({ icon, onPress, disabled, dim, flip }: { icon: Parameters<typeof Icon>[0]['name']; onPress: () => void; disabled?: boolean; dim?: boolean; flip?: boolean }) {
  const { colors } = useTheme();
  // `dim` = grisé visuel MAIS toujours cliquable (l'état canGoBack/Forward de la
  // WebView peut être périmé sur les dApps SPA ; goBack/goForward reste un no-op sûr).
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={6} style={({ pressed }) => ({ padding: spacing(1), opacity: disabled ? 0.3 : pressed ? 0.5 : dim ? 0.4 : 1 })}>
      <View style={flip ? { transform: [{ rotate: '180deg' }] } : undefined}>
        <Icon name={icon} size={24} color={colors.text} />
      </View>
    </Pressable>
  );
}

/**
 * Barre de progression de chargement (façon Safari/Chrome) : trait accent fin sous
 * la barre d'adresse. Largeur = progression (0→1), puis fondu de sortie à 100 %.
 */
function LoadBar({ progress }: { progress: number }) {
  const { colors } = useTheme();
  const width = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const done = progress >= 1 || progress <= 0;
  useEffect(() => {
    if (done) {
      // Termine la barre puis la fait disparaître en fondu.
      // width (layout) impose useNativeDriver:false ; opacity DOIT rester false aussi,
      // sinon le nœud passe côté natif et width plante ('width not supported by native').
      Animated.sequence([
        Animated.timing(width, { toValue: 1, duration: duration.base, easing: easing.out, useNativeDriver: false }),
        Animated.timing(opacity, { toValue: 0, duration: duration.base, easing: easing.out, useNativeDriver: false }),
      ]).start(() => width.setValue(0));
    } else {
      opacity.setValue(1);
      Animated.timing(width, { toValue: progress, duration: duration.base, easing: easing.out, useNativeDriver: false }).start();
    }
  }, [progress, done, width, opacity]);
  return (
    <View pointerEvents="none" style={{ height: 2.5, marginTop: -1, backgroundColor: 'transparent' }}>
      <Animated.View
        style={{
          height: 2.5,
          borderRadius: 2,
          backgroundColor: colors.accent,
          opacity,
          width: width.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
        }}
      />
    </View>
  );
}

/** Titre de section avec petit accent vertical (accueil du navigateur). */
function SectionTitle({ children }: { children: React.ReactNode }) {
  const { colors, typography } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1) }}>
      <View style={{ width: 3, height: 15, borderRadius: 2, backgroundColor: colors.accent }} />
      <Text style={typography.section}>{children}</Text>
    </View>
  );
}

/** Ligne du menu (⋮). */
function MenuRow({ icon, label, onPress }: { icon: Parameters<typeof Icon>[0]['name']; label: string; onPress: () => void }) {
  const { colors, typography } = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: spacing(1.75), paddingVertical: spacing(1.5), paddingHorizontal: spacing(1), opacity: pressed ? 0.6 : 1 })}>
      <Icon name={icon} size={20} color={colors.text} />
      <Text style={typography.body}>{label}</Text>
    </Pressable>
  );
}

/**
 * Logo d'un site : carré à COINS ARRONDIS (pas un cercle), logo centré sans
 * déformation (resizeMode contain), fond clair. Repli pastille (emoji/lettre)
 * sur la couleur de marque si le favicon échoue — façon Phantom/Rabby.
 */
function Favicon({ host, size, color, label, emoji }: { host: string; size: number; color: string; label?: string; emoji?: string }) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  // Carré à coins arrondis (radius ~ 32 %) — jamais un cercle ni une capsule.
  const radius = Math.round(size * 0.32);
  const imgSize = Math.round(size * 0.71); // logo centré, marge autour
  const shadow = { shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 5 } as const;
  if (failed || !host) {
    return (
      <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: color, alignItems: 'center', justifyContent: 'center', ...shadow }}>
        <Text style={{ fontSize: size * 0.5, color: colors.text }}>{emoji ?? label ?? '◈'}</Text>
      </View>
    );
  }
  return (
    <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', ...shadow }}>
      <Image
        source={{ uri: faviconUrl(host) }}
        onError={() => setFailed(true)}
        resizeMode="contain"
        style={{ width: imgSize, height: imgSize }}
      />
    </View>
  );
}

/**
 * Tuile carrée d'un raccourci (site / collection / favori) : conteneur à
 * dimensions FIXES (96×108) → le logo n'est jamais étiré en capsule.
 */
function Tile({ host, name, color, emoji, width, onPress }: { host: string; name: string; color: string; emoji?: string; width: number; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Vibration.vibrate(6)}
      style={({ pressed }) => ({ width, alignItems: 'center', transform: [{ scale: pressed ? 0.96 : 1 }] })}
    >
      <View style={{ padding: 4, borderRadius: Math.round(56 * 0.32) + 4, backgroundColor: colors.glass }}>
        <Favicon host={host} size={56} color={colors.glassStrong} emoji={emoji} label={name.slice(0, 1).toUpperCase()} />
      </View>
      <Text numberOfLines={1} style={{ marginTop: 8, color: colors.text, fontSize: 12, fontFamily: fonts.semibold, textAlign: 'center', maxWidth: width }}>
        {name}
      </Text>
    </Pressable>
  );
}

/** Bandeau vert rassurant : signature = gratuite (aucun frais de réseau). */
function FreeSignature() {
  const { colors } = useTheme();
  const t = useT();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing(1) }}>
      <Text style={{ fontSize: 13 }}>🔒</Text>
      <Text style={{ color: colors.up, fontSize: 13, fontFamily: fonts.semibold }}>{t('freeSignature')}</Text>
    </View>
  );
}


function SiteBadge({ sec }: { sec: SecLevel }) {
  const { colors } = useTheme();
  
  if (sec === 'safe') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.up + '22', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6 }}>
        <Icon name="security" size={12} color={colors.up} />
        <Text style={{ color: colors.up, fontSize: 11, fontWeight: '600' }}>Vérifié</Text>
      </View>
    );
  }
  if (sec === 'suspicious') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.danger + '22', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6 }}>
        <Icon name="warning" size={12} color={colors.danger} />
        <Text style={{ color: colors.danger, fontSize: 11, fontWeight: '600' }}>Risque</Text>
      </View>
    );
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.glass, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6 }}>
      <Icon name="security" size={12} color={colors.textMuted} />
      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600' }}>Inconnu</Text>
    </View>
  );
}

function AnimatedTab({ index, active, host, tb, onPress, onClose, isNew }: any) {
  const { colors, typography } = useTheme();
  const t = useT();
  const anim = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: duration.base, easing: easing.out, delay: index * 40, useNativeDriver: true }).start();
  }, [anim, index]);
  
  return (
    <Animated.View style={{ width: '47%', opacity: anim, transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }, { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
      {isNew ? (
        <Pressable onPress={onPress}>
          <GlassCard style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: spacing(3), gap: 6, borderStyle: 'dashed' }}>
            <Icon name="add" size={26} color={colors.accent} />
            <Text style={{ color: colors.accent, fontFamily: fonts.semibold }}>{t('newTabLabel')}</Text>
          </GlassCard>
        </Pressable>
      ) : (
        <Pressable onPress={onPress}>
          <GlassCard style={{ gap: spacing(1), borderColor: active ? colors.accent : colors.glassBorder, borderWidth: active ? 1.5 : 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1) }}>
              {host ? <Favicon host={host} size={22} color={colors.glassStrong} label={host.slice(0, 1).toUpperCase()} /> : <Icon name="home" size={20} color={colors.textMuted} />}
              <Text style={[typography.bodyStrong, { flex: 1, fontSize: 13 }]} numberOfLines={1}>{tb.title || (host || t('homeWord'))}</Text>
              <Pressable onPress={onClose} hitSlop={8}>
                <Icon name="close" size={16} tone="muted" />
              </Pressable>
            </View>
            <Text style={typography.muted} numberOfLines={1}>{host || t('newTabLabel')}</Text>
          </GlassCard>
        </Pressable>
      )}
    </Animated.View>
  );
}
