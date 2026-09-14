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
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, TextInput, Pressable as RNPressable, ScrollView, Share, Alert, Switch, Image, useWindowDimensions, KeyboardAvoidingView, Platform, Linking } from 'react-native';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { Text, Button, IconButton, Surface, Divider, ListRow, Sheet, Chip, EmptyState, AddressGlyph, Input, Pressable } from '../ui/kit';
import { Icon } from '../ui/icon';
import { SignSheet } from '../ui/SignSheet';
import { ConfirmUnlock } from '../ui/ConfirmUnlock';
import { AddressBar, splitHost } from '../ui/browser/AddressBar';
import { AppTabBar } from '../ui/tabs';
import { RemoteIcon } from '../ui/premium';
import { Comet } from '../ui/browser/Comet';
import { DappTile, DappLogo, siteName } from '../ui/browser/DappTile';
import { useTheme } from '../ui/theme';
import { space, SCREEN_MARGIN, radius, springs } from '../ui/tokens';
import { haptic } from '../lib/haptics';
import { sound } from '../lib/sound';
import { useWallet, type Unlock } from '../lib/walletStore';
import { useSettings, useT } from '../lib/settingsStore';
import { toast } from '../lib/toast';
import { loadRecents, pushRecent, clearRecents, loadFavorites, toggleFavorite, type RecentDapp } from '../lib/recentDapps';
import { useDappActivity } from '../lib/dappActivity';
import { technicalLogger } from '../lib/technicalLogger';
import { useBrowserStore } from '../lib/browserStore';
import { usePortfolioStore } from '../lib/portfolio';
import { saveTabs, loadTabs } from '../lib/browserTabs';
import { loadBrowserPrefs, saveEngine, saveForceDark, ENGINES, VERIFIED_DAPPS, type SearchEngine } from '../lib/browserPrefs';
import { buildInjectedProvider, parseDappMessage, respondJs, emitJs, rpcProxy, READONLY_METHODS, type DappRequest } from '../lib/dappProvider';
import {
  getAdapter, listChains, hexToText, parseSiwe, siweDomainMismatch, summarizeTypedData, assessAddress, isPhishingSite,
  decodeTx, simulateTx, explainRequest, getTokenMetadata, chainIconUrl, isValidEvmAddress, type RawTxRequest, type RiskAssessment, type Simulation,
} from '../src';
import { useHistoryStore } from '../lib/historyStore';

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
  | { kind: 'typedData'; tabId: string; id: number; origin: string; summary: ReturnType<typeof summarizeTypedData>; data: unknown }
  | { kind: 'tx'; tabId: string; id: number; origin: string; to?: string; value: bigint; raw: RawTxRequest };

function originOf(url: string): string {
  const m = url.match(/^https:\/\/([^/]+)/i);
  return m ? m[1].toLowerCase() : '';
}
/** Domaines dApp reconnus (sosies → suspect). */
const SAFE_ROOTS = ['uniswap', 'opensea', 'aave', 'pancakeswap', 'lido', 'ens', 'curve', '1inch', 'compound', 'blur', 'rarible', 'jup', 'morpho', 'magiceden', 'across', 'stargate', 'jumper', 'rocketpool', 'jito', 'eigenlayer'];
function isLookalike(host: string): boolean {
  const root = splitHost(host).root.split('.')[0].toLowerCase();
  if (SAFE_ROOTS.includes(root)) return false;
  return SAFE_ROOTS.some((r) => Math.abs(r.length - root.length) <= 1 && r !== root && (root.includes(r) || r.includes(root) || levenshtein1(r, root)));
}
function levenshtein1(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, diff = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++diff > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return diff + (a.length - i) + (b.length - j) <= 1;
}
function normalizeUrl(raw?: string | null): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s || /\s/.test(s)) return null;
  if (/^https?:\/\//i.test(s)) return s.replace(/^http:\/\//i, 'https://');
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(s)) return `https://${s}`;
  return null;
}
const DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';

export default function Browser() {
  const t = useT();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const setBrowserContext = useBrowserStore((s) => s.setBrowserContext);
  const account = useWallet((s) => s.account);
  const activeChain = useWallet((s) => s.activeChain);
  const setActiveChain = useWallet((s) => s.setActiveChain);
  const biometricEnabled = useSettings((s) => s.biometricEnabled);
  const showTestnets = useSettings((s) => s.showTestnets);

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

  const [progress, setProgress] = useState(0);
  const [webError, setWebError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState('');
  const [switcher, setSwitcher] = useState(false);
  const [menu, setMenu] = useState(false);
  const [connSheet, setConnSheet] = useState(false);
  const [findSheet, setFindSheet] = useState(false);
  const [findQ, setFindQ] = useState('');
  const [netQ, setNetQ] = useState('');
  const pfHoldings = usePortfolioStore((st) => st.holdings);
  const [engine, setEngine] = useState<SearchEngine>('google');
  const [forceDark, setForceDark] = useState(false);
  const [category, setCategory] = useState(VERIFIED_DAPPS[0].category);
  const [recents, setRecents] = useState<RecentDapp[]>([]);
  const [favorites, setFavorites] = useState<RecentDapp[]>([]);
  const recentsRef = useRef<RecentDapp[]>([]);
  const favRef = useRef<RecentDapp[]>([]);
  const applyRecents = (l: RecentDapp[]) => { recentsRef.current = l; setRecents(l); };
  const applyFav = (l: RecentDapp[]) => { favRef.current = l; setFavorites(l); };
  const [dangerHosts, setDangerHosts] = useState<Record<string, boolean>>({});
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

  useEffect(() => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const h = setTimeout(() => saveTabs(tabs.filter((t) => !t.incognito).map((t) => ({ id: t.id, url: t.url, title: t.title, chainId: t.chainId })), activeId), 500);
    return () => clearTimeout(h);
  }, [tabs, activeId]);
  useEffect(() => {
    setProgress(0);
    setWebError(null);
    compact.value = 0;
    lastY.current = 0;
  }, [activeId, compact]);

  // Deep-link : /browser?url=…
  const { url: urlParam } = useLocalSearchParams<{ url?: string }>();
  useEffect(() => {
    const u = urlParam ? normalizeUrl(String(urlParam)) : null;
    if (u) updateTab(activeRef.current, { url: u });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlParam]);

  // Site dangereux (GoPlus) — vérifié une fois par hôte.
  useEffect(() => {
    if (!origin || origin in dangerHosts || !useSettings.getState().securityScan) return;
    isPhishingSite(`https://${origin}`).then((bad) => { setDangerHosts((d) => ({ ...d, [origin]: bad })); if (bad) haptic.warning(); }).catch(() => setDangerHosts((d) => ({ ...d, [origin]: false })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin]);
  const danger = !!origin && (dangerHosts[origin] === true || isLookalike(origin));

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
  const onShouldStart = useCallback((req: { url: string; navigationType?: string }) => {
    const u = req.url;
    if (/^https?:\/\//i.test(u) || u === 'about:blank') {
      if (/\.apk(\?|$)/i.test(u)) {
        Alert.alert(t('downloadBlockedTitle'), t('downloadBlockedMsg'), [{ text: t('understood') }]);
        return false;
      }
      return true;
    }
    if (/^(intent|market|tel|sms|mailto|file|javascript):/i.test(u) || /^[a-z][a-z0-9+.-]*:\/\//i.test(u)) {
      const scheme = u.split(':')[0];
      Alert.alert(t('openOtherAppTitle'), t('openOtherAppMsg').replace('{scheme}', scheme), [
        { text: t('deny'), style: 'cancel' },
        { text: t('open'), onPress: () => Linking.openURL(u).catch(() => toast.error(t('cannotOpenLink'))) },
      ]);
      return false;
    }
    return false;
  }, []);

  // ── Pont EIP-1193 ──
  const connected = useRef<Set<string>>(new Set());
  const [pending, setPending] = useState<Pending | null>(null);
  const [sim, setSim] = useState<Simulation | 'loading' | null>(null);
  const [signConfirm, setSignConfirm] = useState(false);
  const [risk, setRisk] = useState<RiskAssessment | 'loading' | null>(null);
  const [phishSite, setPhishSite] = useState(false);
  const [rememberSite, setRememberSite] = useState(false);
  const [connectLine, setConnectLine] = useState(0); // 0..1 : trait de lumière logo → glyphe
  const injected = useMemo(() => buildInjectedProvider(chainIdHex), [chainIdHex]);
  const inject = useCallback((js: string) => webref.current?.injectJavaScript(js), []);
  const respond = useCallback((id: number, result: unknown, err?: { code: number; message: string }) => inject(respondJs(id, result, err)), [inject]);
  const reject = useCallback((id: number, code = 4001, message = t('refuse')) => {
    technicalLogger.logDapp('request_rejected_by_user', undefined, { code, message }, true);
    return respond(id, null, { code, message });
  }, [respond, t]);

  const onDappRequest = useCallback(
    async (req: DappRequest, reqOrigin: string, tabId: string) => {
      const { id, method, params } = req;
      technicalLogger.logDapp(`method_${method}`, reqOrigin);
      const addr = account?.address;
      const tb = tabsRef.current.find((x) => x.id === tabId);
      const isConnected = connected.current.has(reqOrigin);
      try {
        if (method === 'eth_chainId') return respond(id, chainIdHex);
        if (method === 'net_version') return respond(id, String(chain.evmChainId ?? 1));
        if (method === 'eth_accounts') return respond(id, isConnected && addr ? [addr] : []);
        if (method === 'wallet_getPermissions') return respond(id, isConnected ? [{ parentCapability: 'eth_accounts' }] : []);
        if (method === 'eth_requestAccounts' || method === 'wallet_requestPermissions') {
          if (isConnected && addr) return respond(id, method === 'eth_requestAccounts' ? [addr] : [{ parentCapability: 'eth_accounts' }]);
          if (addr && !tb?.incognito && useDappActivity.getState().isRemembered(reqOrigin)) {
            connected.current.add(reqOrigin);
            inject(emitJs('accountsChanged', [addr]));
            inject(emitJs('connect', { chainId: chainIdHex }));
            useDappActivity.getState().addConnection({ host: reqOrigin, url: `https://${reqOrigin}`, title: reqOrigin });
            return respond(id, method === 'eth_requestAccounts' ? [addr] : [{ parentCapability: 'eth_accounts' }]);
          }
          setPending({ kind: 'connect', tabId, id, origin: reqOrigin });
          return;
        }
        if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') {
          const want = Number((params[0] as { chainId?: string })?.chainId ?? '0x0');
          const target = listChains().find((c) => c.family === 'evm' && c.evmChainId === want);
          if (!target) return respond(id, null, { code: 4902, message: t('networkNotSupported') });
          updateTab(tabId, { chainId: target.id });
          setActiveChain(target.id);
          respond(id, null);
          inject(emitJs('chainChanged', '0x' + want.toString(16)));
          return;
        }
        const isSigning = method === 'personal_sign' || method === 'eth_sign' || method.startsWith('eth_signTypedData') || method === 'eth_sendTransaction';
        if (isSigning) {
          if (!isConnected || !addr) return respond(id, null, { code: 4100, message: t('notConnected') });
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
          if (!tx.to || !isValidEvmAddress(tx.to)) return respond(id, null, { code: 4200, message: 'Déploiement de contrat non supporté' });
          const raw: RawTxRequest = { to: tx.to, data: tx.data ?? '0x', value: tx.value ? BigInt(tx.value) : 0n, chainId: chain.evmChainId!, gasLimit: tx.gas ? BigInt(tx.gas) : undefined };
          setPending({ kind: 'tx', tabId, id, origin: reqOrigin, to: tx.to, value: raw.value ?? 0n, raw });
          return;
        }
        if (READONLY_METHODS.has(method)) return respond(id, await rpcProxy(chain.rpcUrls, method, params));
        respond(id, null, { code: -32601, message: `${t('methodNotSupported')}${method}` });
      } catch (e) {
        respond(id, null, { code: -32603, message: e instanceof Error ? e.message.slice(0, 160) : t('internalError') });
      }
    },
    [account?.address, chain, chainIdHex, respond, inject, setActiveChain], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Analyse GoPlus + simulation à l'apparition d'une demande.
  useEffect(() => {
    setRisk(null); setPhishSite(false); setSim(null); setSignConfirm(false); setConnectLine(0);
    if (!pending) return;
    haptic.light();
    if (useSettings.getState().securityScan) {
      const cid = chain.evmChainId ?? 1;
      if (pending.kind === 'tx' && pending.to) { setRisk('loading'); assessAddress(cid, pending.to).then((r) => { setRisk(r); if (r?.level === 'danger') haptic.warning(); }).catch(() => setRisk(null)); }
      else if (pending.kind === 'typedData' && pending.summary?.verifyingContract) { setRisk('loading'); assessAddress(cid, pending.summary.verifyingContract).then((r) => { setRisk(r); if (r?.level === 'danger') haptic.warning(); }).catch(() => setRisk(null)); }
      else if (pending.kind === 'connect') { isPhishingSite(`https://${pending.origin}`).then((r) => { setPhishSite(r); if (r) haptic.warning(); }).catch(() => {}); }
    }
    if (pending.kind === 'tx' && account) {
      let alive = true;
      setSim('loading');
      (async () => {
        const d = decodeTx({ to: pending.raw.to, value: pending.raw.value, data: pending.raw.data });
        const meta = d.kind === 'transfer' || d.kind === 'approve' ? await getTokenMetadata(chain, d.token).catch(() => null) : null;
        const r = await simulateTx(chain, { from: account.address, to: pending.raw.to, value: pending.raw.value, data: pending.raw.data }, meta ? { symbol: meta.symbol, decimals: meta.decimals } : undefined);
        if (alive) setSim(r);
      })();
      return () => { alive = false; };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending?.id]);

  const explanation = useMemo(() => {
    if (!pending || pending.kind === 'connect') return null;
    const addressRisk = risk && risk !== 'loading' ? risk : null;
    if (pending.kind === 'sign') return explainRequest({ kind: pending.siwe ? 'siwe' : 'message', domain: pending.origin, siwe: pending.siwe, siweMismatch: !!pending.siwe && siweDomainMismatch(pending.siwe.domain, `https://${pending.origin}`), addressRisk, phishingSite: phishSite });
    if (pending.kind === 'typedData') return explainRequest({ kind: 'typedData', domain: pending.origin, typed: pending.summary, addressRisk, phishingSite: phishSite });
    const decoded = decodeTx({ to: pending.raw.to, value: pending.raw.value, data: pending.raw.data });
    return explainRequest({ kind: 'tx', domain: pending.origin, decoded, simulation: sim && sim !== 'loading' ? sim : null, addressRisk, phishingSite: phishSite, nativeSymbol: chain.nativeSymbol });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, sim, risk, phishSite]);

  const perform = async (unlock: Unlock) => {
    if (!pending || !account) return;
    const activity = useDappActivity.getState();
    const tb = tabsRef.current.find((x) => x.id === pending.tabId);
    if (pending.kind === 'connect') {
      await useWallet.getState().verifyUnlock(unlock);
      connected.current.add(pending.origin);
      respond(pending.id, [account.address]);
      inject(emitJs('accountsChanged', [account.address]));
      inject(emitJs('connect', { chainId: chainIdHex }));
      if (!tb?.incognito) {
        activity.addConnection({ host: pending.origin, url: `https://${pending.origin}`, title: tb?.title || pending.origin });
        if (rememberSite) activity.remember(pending.origin);
      }
      haptic.success();
      // La connexion lumineuse : un trait relie le logo du site à ton glyphe (400 ms).
      setConnectLine(1);
      await new Promise((r) => setTimeout(r, 450));
    } else {
      const w = useWallet.getState();
      let result: string;
      if (pending.kind === 'sign') result = await w.signMessage(unlock, pending.hex);
      else if (pending.kind === 'typedData') result = await w.signTypedData(unlock, pending.data as Parameters<typeof w.signTypedData>[1]);
      else result = await w.sendRawTxOn(unlock, tb?.chainId ?? activeChain, pending.raw);
      respond(pending.id, result);
      if (pending.kind === 'tx' && tb?.chainId) {
        const chainAddress = useWallet.getState().account?.address;
        if (chainAddress) {
          void useHistoryStore.getState().fetchHistory(tb.chainId, chainAddress);
        }
      }
      if (!tb?.incognito) activity.addSignature({ host: pending.origin, kind: pending.kind === 'tx' ? 'tx' : pending.kind === 'typedData' ? 'typedData' : 'sign' });
      haptic.success();
      sound.success();
    }
    setPending(null);
    setRememberSite(false);
  };
  const deny = () => {
    if (pending) reject(pending.id);
    setPending(null);
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
        <Surface><EmptyState icon="dapps" title={t('browserUnavailableTitle')} body={t('browserUnavailableMsg')} actionLabel={t('back')} onAction={() => router.back()} /></Surface>
      </View>
    );
  }
  const WebViewAny = WebViewComp as React.ComponentType<Record<string, unknown>>;
  const Highlight = ({ text }: { text: string }) => {
    const i = q ? text.toLowerCase().indexOf(q) : -1;
    if (i < 0) return <Text variant="body" numberOfLines={1}>{text}</Text>;
    return <Text variant="body" tone="secondary" numberOfLines={1}>{text.slice(0, i)}<Text variant="body">{text.slice(i, i + q.length)}</Text>{text.slice(i + q.length)}</Text>;
  };

  // ── Page nouvel onglet ──
  const NewTabPage = () => {
    const cat = VERIFIED_DAPPS.find((c) => c.category === category) ?? VERIFIED_DAPPS[0];
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, padding: SCREEN_MARGIN, paddingTop: space[3], paddingBottom: space[10], gap: space[5] }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {activeTab.incognito ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <Icon name="incognito" size={18} tone="muted" />
            <Text variant="caption" tone="secondary">{t('privateTabMsg')}</Text>
          </View>
        ) : null}
        {favorites.length > 0 ? (
          <View style={{ gap: space[3] }}>
            <Text variant="title2">{t('favorites')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
              {favorites.map((f) => <DappTile key={f.host} host={f.host} label={f.title || f.host} onPress={() => go(f.url, f.title)} />)}
            </View>
          </View>
        ) : null}
        {recents.length > 0 && !activeTab.incognito ? (
          <View style={{ gap: space[3] }}>
            <Text variant="title2">{t('recents')}</Text>
            <View>
              {recents.slice(0, 5).map((r) => (
                <ListRow key={r.host} style={{ paddingHorizontal: 0, minHeight: 56 }} left={<DappLogo host={r.host} size={32} />} title={siteName(r.host)} subtitle={r.host} onPress={() => go(r.url, siteName(r.host))} />
              ))}
            </View>
          </View>
        ) : null}
        <View style={{ gap: space[3] }}>
          <View style={{ flexDirection: 'row', gap: space[5] }}>
            {VERIFIED_DAPPS.map((c) => {
              const on = c.category === category;
              return (
                <RNPressable key={c.category} onPress={() => { haptic.selection(); setCategory(c.category); }} accessibilityRole="tab" accessibilityState={{ selected: on }} style={{ paddingVertical: space[1], borderBottomWidth: 2, borderBottomColor: on ? colors.text : 'transparent' }}>
                  <Text variant="body" tone={on ? 'primary' : 'secondary'}>{c.category}</Text>
                </RNPressable>
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
            {cat.items.map((d) => <DappTile key={d.host} host={d.host} label={d.name} onPress={() => go(d.url, d.name)} />)}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[2] }}>
            <Icon name="security" size={14} tone="muted" />
            <Text variant="caption" tone="secondary" style={{ flex: 1, fontFamily: 'GeneralSans-Regular' }}>{t('verifiedDappsMsg')}</Text>
          </View>
        </View>
      </ScrollView>
    );
  };

  const siteConn = origin ? connections.find((c) => c.host === origin) : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ height: insets.top, backgroundColor: colors.bg }} />
      <Comet progress={activeTab.url ? progress : 0} />

      {/* Contenu : UNE WebView (onglet actif) ou la page nouvel onglet */}
      <View style={{ flex: 1 }}>
        {activeTab.url ? (
          webError ? (
            <View style={{ flex: 1, justifyContent: 'center', padding: SCREEN_MARGIN }}>
              <Surface style={{ gap: space[3], alignItems: 'center' }}>
                <Icon name="warning" size={28} color={colors.warning} />
                <Text variant="title2" style={{ textAlign: 'center' }}>{t('cannotOpenPage')}</Text>
                <Text variant="bodySecondary" tone="secondary" style={{ textAlign: 'center' }}>
                  {t('siteNotResponding')}
                </Text>
                <Text variant="caption" tone="tertiary" style={{ textAlign: 'center' }} numberOfLines={2}>{webError}</Text>
                <Button label={t('retry')} icon="refresh" onPress={() => { setWebError(null); setProgress(0); }} />
                <Button label={t('backToHome')} variant="secondary" onPress={goHome} />
              </Surface>
            </View>
          ) : <WebViewAny
            key={`${activeTab.id}:${activeTab.desktop ? 'd' : 'm'}`}
            ref={(r: WV | null) => { webref.current = r; }}
            source={{ uri: activeTab.url }}
            originWhitelist={['https://*', 'about:blank']}
            onShouldStartLoadWithRequest={onShouldStart}
            onLoadProgress={(e: { nativeEvent: { progress: number } }) => setProgress(e.nativeEvent.progress)}
            onError={(e: { nativeEvent?: { description?: string; code?: number } }) => {
              const errDesc = e.nativeEvent?.description || `${t('networkError')}${e.nativeEvent?.code ? ` (${e.nativeEvent.code})` : ''}`;
              setWebError(errDesc);
              technicalLogger.logDapp('page_load_failed', activeTab.url || undefined, { error: errDesc, code: e.nativeEvent?.code }, true);
            }}
            onScroll={onWebScroll}
            injectedJavaScriptBeforeContentLoaded={injected}
            onMessage={(e: { nativeEvent: { data: string; url?: string } }) => {
              const req = parseDappMessage(e.nativeEvent.data);
              if (req) onDappRequest(req, originOf(e.nativeEvent.url ?? activeTab.url ?? ''), activeTab.id);
            }}
            onNavigationStateChange={(nav: { url: string; title?: string; canGoBack: boolean; canGoForward: boolean }) => {
              updateTab(activeTab.id, { url: nav.url, title: nav.title ?? '', canBack: nav.canGoBack, canFwd: nav.canGoForward });
              setBrowserContext({ currentUrl: nav.url, currentTitle: nav.title || '' });
              const host = originOf(nav.url);
              const top = recentsRef.current[0];
              if (!activeTab.incognito && host && !(top && top.host === host)) pushRecent({ url: nav.url, host, title: siteName(host) }, recentsRef.current).then(applyRecents);
            }}
            allowsBackForwardNavigationGestures
            pullToRefreshEnabled
            setSupportMultipleWindows={false}
            incognito={activeTab.incognito}
            forceDarkOn={forceDark}
            userAgent={activeTab.desktop ? DESKTOP_UA : undefined}
            style={{ flex: 1, backgroundColor: colors.bg }}
          />
        ) : (
          <NewTabPage />
        )}

        {/* Suggestions (mode édition) */}
        {editing ? (
          <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: colors.bg }}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: SCREEN_MARGIN, paddingTop: space[4], gap: space[2] }}>
              {q ? (
                <>
                  {suggestions.map((s) => (
                    <Pressable key={s.host} onPress={() => go(s.url, s.title)} noScale style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 56 }}>
                      <DappLogo host={s.host} size={32} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Highlight text={s.title || s.host} />
                        <Text variant="caption" tone="tertiary" numberOfLines={1}>{s.host}</Text>
                      </View>
                      <Icon name={s.kind === 'fav' ? 'starFilled' : s.kind === 'verified' ? 'check' : 'history'} size={14} tone="faint" />
                    </Pressable>
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

      {/* Chrome du bas : [←] [adresse] [onglets] [⋮] */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View style={[{ flexDirection: 'row', alignItems: 'center', gap: space[1], paddingHorizontal: space[2], paddingTop: space[2], paddingBottom: !activeTab.url && !editing ? insets.bottom + 84 : insets.bottom + space[2], backgroundColor: colors.bg }, chromeStyle]}>
          {editing ? (
            <>
              <IconButton icon="close" label={t('cancel')} tone="ghost" onPress={() => { setEditing(false); setInput(''); }} />
              <View style={{ flex: 1, height: 48, borderRadius: radius.round, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.textSecondary, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[4], gap: space[2] }}>
                <Icon name="search" size={15} tone="muted" />
                <TextInput autoFocus value={input} onChangeText={setInput} onSubmitEditing={() => go(input)} placeholder={t('searchOrEnterUrl')} placeholderTextColor={colors.textTertiary} autoCapitalize="none" autoCorrect={false} keyboardType="url" returnKeyType="go" selectTextOnFocus style={{ flex: 1, color: colors.text, fontSize: 16, fontFamily: 'GeneralSans-Medium', paddingVertical: 0 }} />
                {input ? <RNPressable onPress={() => setInput('')} hitSlop={8}><Icon name="close" size={14} tone="muted" /></RNPressable> : null}
              </View>
              <IconButton icon="scan" label={t('scanQr')} tone="ghost" onPress={() => router.push('/scan')} />
            </>
          ) : (
            <>
              <IconButton icon="caretLeft" label={t('previousPage')} tone="ghost" disabled={!activeTab.url && tabs.length === 1} onPress={() => (activeTab.canBack ? webref.current?.goBack() : activeTab.url ? goHome() : router.back())} />
              <AddressBar
                host={origin}
                secure={!!activeTab.url?.startsWith('https://')}
                danger={danger}
                incognito={activeTab.incognito}
                address={origin ? account?.address : undefined}
                chainId={activeTab.chainId}
                compact={compact}
                loading={progress > 0 && progress < 1}
                placeholder={t('searchOrEnterUrl')}
                onPress={() => { compact.value = withSpring(0, springs.standard); setInput(activeTab.url ?? ''); setEditing(true); }}
                onLongPress={() => { if (activeTab.url) { Clipboard.setStringAsync(activeTab.url); haptic.light(); toast.success(t('linkCopied'), origin); } }}
                onAccount={() => setConnSheet(true)}
              />
              <RNPressable onPress={() => setSwitcher(true)} accessibilityLabel={`${tabs.length} ${t('tabs')}`} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: colors.text, alignItems: 'center', justifyContent: 'center' }}>
                  <Text variant="micro" tabular>{tabs.length}</Text>
                </View>
              </RNPressable>
              <IconButton icon="more" label={t('menu')} tone="ghost" onPress={() => setMenu(true)} />
            </>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
      {/* Onglet principal « Explorer » : barre de navigation sur la page nouvel onglet. */}
      {!activeTab.url && !editing ? <AppTabBar active="browser" /> : null}

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
              <Pressable key={tb.id} onPress={() => { setActiveId(tb.id); setSwitcher(false); }} accessibilityLabel={tb.title || host || t('newTab')} style={{ width: w }}>
                <View style={{ height: w * 0.75, borderRadius: radius.container, backgroundColor: tb.incognito ? colors.bg : colors.surface1, borderWidth: on ? 2 : 1, borderColor: on ? colors.text : tb.incognito ? colors.textSecondary : colors.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {host ? <DappLogo host={host} size={40} /> : <Icon name={tb.incognito ? 'incognito' : 'add'} size={28} tone="faint" />}
                  <RNPressable onPress={() => closeTab(tb.id)} hitSlop={8} accessibilityLabel={t('closeTab')} style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="close" size={14} />
                  </RNPressable>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space[1] }}>
                  {host ? <DappLogo host={host} size={14} /> : null}
                  <Text variant="caption" numberOfLines={1} style={{ flex: 1 }}>{tb.title || host || (tb.incognito ? t('privateTab') : t('newTab'))}</Text>
                </View>
              </Pressable>
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
              <ListRow left={<Icon name="share" size={20} />} title={t('share')} onPress={() => { setMenu(false); Share.share({ message: activeTab.url! }).catch(() => {}); }} />
              <ListRow left={<Icon name="search" size={20} />} title={t('searchInPage')} onPress={() => { setMenu(false); setFindSheet(true); }} />
              <ListRow left={<Icon name="desktop" size={20} />} title={t('desktopVersion')} right={<Switch value={activeTab.desktop} onValueChange={(v) => updateTab(activeTab.id, { desktop: v })} />} />
              <ListRow left={<Icon name="walletconnect" size={20} />} title={t('siteConnection')} subtitle={siteConn ? `${t('connected')} · ${chain.name}` : t('notConnected')} onPress={() => { setMenu(false); setConnSheet(true); }} />
              <ListRow left={<Icon name="refresh" size={20} />} title={t('reload')} onPress={() => { setMenu(false); webref.current?.reload(); }} />
              <Divider />
            </>
          ) : null}
          <ListRow left={<Icon name="add" size={20} />} title={t('newTab')} onPress={() => newTab(false)} />
          <ListRow left={<Icon name="incognito" size={20} />} title={t('privateTab')} subtitle={t('nothingRemembered')} onPress={() => newTab(true)} />
          <ListRow left={<Icon name="appearance" size={20} />} title={t('darkSites')} right={<Switch value={forceDark} onValueChange={(v) => { setForceDark(v); saveForceDark(v); }} />} />
          <ListRow left={<Icon name="search" size={20} />} title={t('searchEngine')} subtitle={ENGINES.find((e) => e.key === engine)?.label} onPress={() => { const i = ENGINES.findIndex((e) => e.key === engine); const n = ENGINES[(i + 1) % ENGINES.length].key; setEngine(n); saveEngine(n); }} />
          <ListRow left={<Icon name="history" size={20} />} title={t('history')} subtitle={`${recents.length} site${recents.length > 1 ? 's' : ''}`} onPress={() => { setMenu(false); goHome(); }} />
          <View style={{ height: space[3] }} />
          <ListRow
            left={<Icon name="broom" size={20} color={colors.danger} />}
            title={t('clearData')}
            subtitle={t('historyAndRememberedSites')}
            style={{ minHeight: 56 }}
            onPress={() => {
              setMenu(false);
              Alert.alert(`${t('clearData')} ?`, t('clearDataConfirmMsg'), [
                { text: t('cancel'), style: 'cancel' },
                {
                  text: t('clearData'),
                  style: 'destructive',
                  onPress: () => {
                    clearRecents();
                    applyRecents([]);
                    connections.forEach((c) => removeConnection(c.host));
                    connected.current.clear();
                    toast.success(t('dataCleared'));
                  },
                },
              ]);
            }}
          />
        </View>
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
                connected.current.delete(origin);
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

        <Surface style={{ padding: space[3], borderRadius: radius.container, gap: space[2] }}>
          <Text variant="caption" tone="secondary">{t('canSeeAddress')}</Text>
          <Text variant="caption" tone="secondary">{t('canProposeTx')}</Text>
          <Text variant="caption" tone="secondary">{t('cannotMove')}</Text>
          <Divider />
          <Pressable onPress={() => setRememberSite((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: rememberSite ? colors.text : colors.border, backgroundColor: rememberSite ? colors.text : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              {rememberSite ? <Icon name="check" size={14} color={colors.bg} /> : null}
            </View>
            <Text variant="body">{t('rememberSite')}</Text>
          </Pressable>
        </Surface>

        <View style={{ flexDirection: 'row', gap: space[2], marginTop: space[2] }}>
          <Button label={t('refuse')} variant="secondary" size="lg" style={{ flex: 1 }} onPress={deny} />
          <Button label={t('connect')} size="lg" style={{ flex: 1 }} onPress={() => setSignConfirm(true)} />
        </View>
      </Sheet>

      {/* Signature ou transaction */}
      <SignSheet
        visible={!!pending && pending.kind !== 'connect' && !signConfirm}
        peer={pending ? { name: activeTab.title || pending.origin, url: `https://${pending.origin}` } : null}
        verify={danger || phishSite ? { validation: 'INVALID', isScam: true } : { validation: 'VALID' }}
        explanation={explanation}
        simulating={sim === 'loading'}
        network={chain.name}
        address={account?.address}
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
        aiContext={pending?.kind === 'tx' ? { to: pending.to ?? '', value: pending.value.toString(), method: 'eth_sendTransaction', url: `https://${pending.origin}` } : undefined}
      />
    </View>
  );
}
