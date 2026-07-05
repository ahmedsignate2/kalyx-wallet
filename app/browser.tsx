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
import { Modal, Pressable, Text, TextInput, View, Image, Vibration, ScrollView, Share } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassCard, ErrorBox, PressableScale } from '../ui/premium';
import { Button } from '../ui/components';
import { Icon } from '../ui/icon';
import { fonts, radii, spacing, useTheme } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { toast } from '../lib/toast';
import { loadRecents, pushRecent, clearRecents, loadFavorites, toggleFavorite, type RecentDapp } from '../lib/recentDapps';
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
  type RawTxRequest,
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
  { name: 'PancakeSwap', url: 'https://pancakeswap.finance', domain: 'pancakeswap.finance', emoji: '🥞', color: '#1FC7D4' },
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

/** Logo d'un site (favicon HD via DuckDuckGo ; repli emoji/lettre au besoin). */
function faviconUrl(host: string): string {
  return `https://icons.duckduckgo.com/ip3/${host}.ico`;
}

/** Couleur de marque du réseau (pastille dans la popup de connexion). */
const NETWORK_COLOR: Record<string, string> = {
  ethereum: '#627EEA',
  polygon: '#8247E5',
  bnb: '#F0B90B',
  base: '#0052FF',
  arbitrum: '#28A0F0',
  optimism: '#FF0420',
  avalanche: '#E84142',
  sepolia: '#7C5CFF',
  bitcoin: '#F7931A',
};

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
function normalizeUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  return /^https:\/\//i.test(t) ? t : /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(t) ? `https://${t}` : null;
}

export default function Browser() {
  const { colors, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const account = useWallet((s) => s.account);
  const activeChain = useWallet((s) => s.activeChain);
  const setActiveChain = useWallet((s) => s.setActiveChain);
  const chain = getAdapter(activeChain).config;
  const chainIdHex = '0x' + (chain.evmChainId ?? 1).toString(16);

  // Onglets (avec ref pour les handlers) + WebView refs par onglet.
  const [tabs, setTabsState] = useState<Tab[]>(() => [mkTab()]);
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
  useEffect(() => {
    loadRecents().then(applyRecents);
    loadFavorites().then(applyFav);
  }, []);

  const injected = useMemo(() => buildInjectedProvider(chainIdHex), [chainIdHex]);
  const isFav = !!origin && favorites.some((f) => f.host === origin);

  // Vibration à l'apparition d'une demande.
  useEffect(() => {
    if (pending) Vibration.vibrate(pending.kind === 'tx' ? [0, 30, 60, 30] : 12);
  }, [pending?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deep-link interne : /browser?url=https://…
  const { url: urlParam } = useLocalSearchParams<{ url?: string }>();
  useEffect(() => {
    const u = urlParam ? normalizeUrl(String(urlParam)) : null;
    if (u) updateTab(activeRef.current, { url: u, input: u });
  }, [urlParam]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Navigue l'onglet actif vers une URL (+ historique). */
  const go = (raw: string, title?: string) => {
    const u = normalizeUrl(raw);
    if (!u) return;
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
  const goHome = () => updateTab(activeRef.current, { url: null, input: '' });

  const toggleCurrentFav = () => {
    if (!origin) return;
    Vibration.vibrate(10);
    toggleFavorite({ url: activeTab.url ?? `https://${origin}`, host: origin, title: activeTab.title || origin }, favRef.current).then((next) => {
      applyFav(next);
      toast.success(next.some((f) => f.host === origin) ? 'Ajouté aux favoris' : 'Retiré des favoris', origin);
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

  const approve = async () => {
    if (!pending || !account) return;
    setError(null);
    if (pending.kind === 'connect') {
      connected.current.add(pending.origin);
      respond(pending.tabId, pending.id, [account.address]);
      inject(pending.tabId, emitJs('accountsChanged', [account.address]));
      inject(pending.tabId, emitJs('connect', { chainId: chainIdHex }));
      Vibration.vibrate(14);
      toast.success('Connexion réussie', pending.origin);
      setPending(null);
      return;
    }
    if (pin.length < 6) {
      setError('Entre ton PIN pour signer.');
      return;
    }
    setBusy(true);
    try {
      const w = useWallet.getState();
      let result: string;
      if (pending.kind === 'sign') result = await w.signMessage({ pin }, pending.hex);
      else if (pending.kind === 'typedData') result = await w.signTypedData({ pin }, pending.data as Parameters<typeof w.signTypedData>[1]);
      else result = await w.sendRawTxOn({ pin }, activeChain, pending.raw);
      respond(pending.tabId, pending.id, result);
      Vibration.vibrate(14);
      toast.success(pending.kind === 'tx' ? 'Transaction envoyée' : 'Signature envoyée', pending.origin);
      setPending(null);
      setPin('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Signature impossible.');
    } finally {
      setBusy(false);
    }
  };

  const deny = () => {
    if (pending) reject(pending.tabId, pending.id);
    setPending(null);
    setPin('');
    setError(null);
  };

  // ------------------------------------------------------------------ UI

  if (!WebViewComp) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bgDeep, padding: spacing(2.5), justifyContent: 'center' }}>
        <Stack.Screen options={{ headerShown: true, title: 'Navigateur' }} />
        <GlassCard>
          <Text style={typography.bodyStrong}>Navigateur indisponible</Text>
          <Text style={[typography.muted, { marginTop: spacing(1) }]}>
            Le module natif react-native-webview n’est pas dans ce build. Refais un dev build puis relance l’app.
          </Text>
        </GlassCard>
      </View>
    );
  }

  const WebViewAny = WebViewComp as React.ComponentType<Record<string, unknown>>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgDeep }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Barre d'adresse */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1), paddingHorizontal: spacing(1.5), paddingTop: insets.top + spacing(1), paddingBottom: spacing(1) }}>
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
          <Icon name="security" size={14} color={origin && connected.current.has(origin) ? colors.up : colors.textMuted} />
          <TextInput
            value={activeTab?.input ?? ''}
            onChangeText={(v) => updateTab(activeId, { input: v })}
            onSubmitEditing={() => go(activeTab?.input ?? '')}
            placeholder="Rechercher ou saisir une URL"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            style={{ flex: 1, color: colors.text, fontSize: 14, paddingVertical: spacing(1) }}
          />
          {activeTab?.url ? (
            <>
              <Pressable onPress={toggleCurrentFav} hitSlop={8}>
                <Icon name={isFav ? 'starFilled' : 'star'} size={17} color={isFav ? colors.warning : colors.textMuted} />
              </Pressable>
              <Pressable onPress={() => (webrefs.current.get(activeId) as WV | undefined)?.reload()} hitSlop={8}>
                <Icon name="refresh" size={16} tone="muted" />
              </Pressable>
            </>
          ) : null}
        </View>
      </View>

      {/* Corps : les WebViews (une par onglet, actif visible) + accueil */}
      <View style={{ flex: 1 }}>
        {tabs.map((t) =>
          t.url ? (
            <WebViewAny
              key={t.id}
              ref={(r: WV | null) => {
                if (r) webrefs.current.set(t.id, r);
                else webrefs.current.delete(t.id);
              }}
              source={{ uri: t.url }}
              originWhitelist={['https://*']}
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
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.bgDeep, display: t.id === activeId ? 'flex' : 'none' }}
            />
          ) : null,
        )}

        {activeTab?.url == null ? (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing(2.5), gap: spacing(2.5), paddingBottom: spacing(6) }} showsVerticalScrollIndicator={false}>
            <View style={{ gap: 4 }}>
              <Text style={typography.title}>Navigateur dApps</Text>
              <Text style={typography.muted}>Chaque action sensible demandera ton PIN.</Text>
            </View>

            {favorites.length > 0 ? (
              <View style={{ gap: spacing(1.25) }}>
                <Text style={typography.section}>Favoris</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1.5) }}>
                  {favorites.map((f) => (
                    <PressableScale key={f.host} onPress={() => go(f.url, f.title)} style={{ width: '30%' }}>
                      <GlassCard style={{ alignItems: 'center', paddingVertical: spacing(2), paddingHorizontal: spacing(0.5), gap: 8 }}>
                        <Favicon host={f.host} size={44} color={colors.glassStrong} label={f.host.slice(0, 1).toUpperCase()} />
                        <Text style={[typography.bodyStrong, { fontSize: 12.5 }]} numberOfLines={1}>{f.title}</Text>
                      </GlassCard>
                    </PressableScale>
                  ))}
                </View>
              </View>
            ) : null}

            <View style={{ gap: spacing(1.25) }}>
              <Text style={typography.section}>Sites populaires</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1.5) }}>
                {SUGGESTED.map((d) => (
                  <DappTile key={d.url} dapp={d} onPress={() => go(d.url, d.name)} />
                ))}
              </View>
            </View>

            <View style={{ gap: spacing(1.25) }}>
              <Text style={typography.section}>Collections tendance</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1.5) }}>
                {COLLECTIONS.map((d) => (
                  <DappTile key={d.url} dapp={d} onPress={() => go(d.url, d.name)} />
                ))}
              </View>
            </View>

            {recents.length > 0 ? (
              <View style={{ gap: spacing(1) }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={typography.section}>Historique</Text>
                  <Pressable onPress={() => { clearRecents(); applyRecents([]); }} hitSlop={8}>
                    <Text style={{ color: colors.textMuted, fontSize: 13 }}>Effacer</Text>
                  </Pressable>
                </View>
                <GlassCard>
                  {recents.map((r, i) => (
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
              </View>
            ) : null}
          </ScrollView>
        ) : null}
      </View>

      {/* Barre d'outils bas façon Chrome : retour / avancer / accueil / onglets / menu */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: spacing(1), paddingTop: spacing(1), paddingBottom: insets.bottom || spacing(1), borderTopWidth: 1, borderTopColor: colors.glassBorder, backgroundColor: colors.bg }}>
        <ToolBtn icon="chevron" flip disabled={!activeTab?.canBack} onPress={() => (webrefs.current.get(activeId) as WV | undefined)?.goBack()} />
        <ToolBtn icon="forward" disabled={!activeTab?.canFwd} onPress={() => (webrefs.current.get(activeId) as WV | undefined)?.goForward()} />
        <ToolBtn icon="home" onPress={goHome} />
        {/* Compteur d'onglets (carré) → sélecteur */}
        <Pressable onPress={() => setSwitcher(true)} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, alignItems: 'center', justifyContent: 'center' })}>
          <View style={{ width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: colors.text, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.text, fontSize: 12, fontFamily: fonts.bold }}>{tabs.length}</Text>
          </View>
        </Pressable>
        <ToolBtn icon="more" onPress={() => setMenu(true)} />
      </View>

      {/* Sélecteur d'onglets */}
      <Modal visible={switcher} transparent animationType="slide" onRequestClose={() => setSwitcher(false)}>
        <View style={{ flex: 1, backgroundColor: colors.bgDeep, paddingTop: insets.top + spacing(1) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing(2.5), paddingVertical: spacing(1.5) }}>
            <Text style={typography.title}>Onglets ({tabs.length})</Text>
            <Pressable onPress={() => setSwitcher(false)} hitSlop={8}>
              <Text style={{ color: colors.accent, fontFamily: fonts.semibold }}>OK</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1.5), padding: spacing(2.5), paddingTop: 0 }}>
            {tabs.map((t) => {
              const host = t.url ? originOf(t.url) : '';
              return (
                <Pressable key={t.id} onPress={() => { setActiveId(t.id); setSwitcher(false); }} style={{ width: '47%' }}>
                  <GlassCard style={{ gap: spacing(1), borderColor: t.id === activeId ? colors.accent : colors.glassBorder, borderWidth: t.id === activeId ? 1.5 : 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1) }}>
                      {host ? <Favicon host={host} size={22} color={colors.glassStrong} label={host.slice(0, 1).toUpperCase()} /> : <Icon name="home" size={20} color={colors.textMuted} />}
                      <Text style={[typography.bodyStrong, { flex: 1, fontSize: 13 }]} numberOfLines={1}>{t.title || (host || 'Accueil')}</Text>
                      <Pressable onPress={() => closeTab(t.id)} hitSlop={8}>
                        <Icon name="close" size={16} tone="muted" />
                      </Pressable>
                    </View>
                    <Text style={typography.muted} numberOfLines={1}>{host || 'Nouvel onglet'}</Text>
                  </GlassCard>
                </Pressable>
              );
            })}
            <Pressable onPress={newTab} style={{ width: '47%' }}>
              <GlassCard style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: spacing(3), gap: 6, borderStyle: 'dashed' }}>
                <Icon name="add" size={26} color={colors.accent} />
                <Text style={{ color: colors.accent, fontFamily: fonts.semibold }}>Nouvel onglet</Text>
              </GlassCard>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      {/* Menu (⋮) façon Chrome */}
      <Modal visible={menu} transparent animationType="slide" onRequestClose={() => setMenu(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} onPress={() => setMenu(false)}>
          <Pressable style={{ backgroundColor: colors.bgDeep, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: spacing(2), paddingBottom: insets.bottom + spacing(2) }}>
            <MenuRow icon="add" label="Nouvel onglet" onPress={() => { setMenu(false); newTab(); }} />
            {activeTab?.url ? <MenuRow icon="refresh" label="Actualiser" onPress={() => { setMenu(false); (webrefs.current.get(activeId) as WV | undefined)?.reload(); }} /> : null}
            {activeTab?.url ? <MenuRow icon={isFav ? 'starFilled' : 'star'} label={isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'} onPress={() => { setMenu(false); toggleCurrentFav(); }} /> : null}
            {activeTab?.url ? <MenuRow icon="share" label="Partager" onPress={() => { setMenu(false); Share.share({ message: activeTab.url! }).catch(() => {}); }} /> : null}
            <MenuRow icon="home" label="Page d'accueil" onPress={() => { setMenu(false); goHome(); }} />
            <MenuRow icon="close" label="Fermer l'onglet" onPress={() => { setMenu(false); closeTab(activeId); }} />
            <MenuRow icon="history" label="Effacer l'historique" onPress={() => { setMenu(false); clearRecents(); applyRecents([]); toast.info('Historique effacé'); }} />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Fenêtre d'approbation (connexion / signature / transaction) */}
      {pending ? (
        <Modal transparent animationType="slide" onRequestClose={deny}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: colors.bgDeep, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: spacing(2.5), paddingBottom: spacing(4), gap: spacing(1.5) }}>
              <Text style={typography.title}>
                {pending.kind === 'connect' ? 'Connexion au site' : pending.kind === 'tx' ? 'Transaction demandée' : 'Signature demandée'}
              </Text>

              <GlassCard>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
                  <Favicon host={pending.origin} size={44} color={colors.glassStrong} label={pending.origin.slice(0, 1).toUpperCase()} />
                  <View style={{ flex: 1 }}>
                    <Text style={typography.bodyStrong} numberOfLines={1}>{activeTab?.title || pending.origin}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: NETWORK_COLOR[chain.id] ?? colors.accent }} />
                      <Text style={typography.muted}>{pending.origin} · {chain.name}</Text>
                    </View>
                  </View>
                </View>
              </GlassCard>

              {pending.kind === 'connect' ? (
                <GlassCard>
                  <Text style={typography.muted}>✓ Peut voir ton adresse publique et tes soldes</Text>
                  <Text style={typography.muted}>✓ Peut te proposer des transactions à signer</Text>
                  <Text style={typography.muted}>✗ Ne peut RIEN déplacer sans ta signature + PIN</Text>
                </GlassCard>
              ) : pending.kind === 'sign' ? (
                <GlassCard>
                  {pending.siwe ? (
                    <>
                      <Text style={typography.bodyStrong}>Se connecter à {pending.siwe.domain}</Text>
                      {siweDomainMismatch(pending.siwe.domain, `https://${pending.origin}`) ? (
                        <ErrorBox message={`⚠️ Le message dit venir de « ${pending.siwe.domain} » mais tu es sur « ${pending.origin} ». Risque de phishing — refuse.`} />
                      ) : (
                        <>
                          <Text style={[typography.muted, { marginTop: spacing(0.5) }]}>Prouve seulement que tu possèdes cette adresse.</Text>
                          <FreeSignature />
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <Text style={typography.muted}>Message à signer</Text>
                      <Text style={[typography.bodyStrong, { fontSize: 14, marginTop: spacing(0.5) }]} numberOfLines={8} selectable>
                        {pending.text ?? 'Message illisible (données binaires) — prudence.'}
                      </Text>
                    </>
                  )}
                  <FreeSignature />
                </GlassCard>
              ) : pending.kind === 'typedData' ? (
                <GlassCard>
                  <Text style={typography.bodyStrong}>{pending.summary?.name ?? 'Données structurées'}</Text>
                  {pending.summary?.primaryType ? <Text style={typography.muted}>Type : {pending.summary.primaryType}</Text> : null}
                  <Text style={[typography.muted, { marginTop: spacing(1) }]}>
                    {pending.summary?.primaryType === 'Permit' ? '⚠️ Un « Permit » autorise un contrat à dépenser tes tokens. Vérifie le site.' : 'Vérifie le contenu avant de signer.'}
                  </Text>
                  <FreeSignature />
                </GlassCard>
              ) : (
                <GlassCard>
                  {pending.to ? (
                    <Text style={typography.muted}>Vers : <Text style={{ color: colors.text, fontFamily: fonts.medium }}>{pending.to.slice(0, 10)}…{pending.to.slice(-8)}</Text></Text>
                  ) : null}
                  <Text style={typography.muted}>Montant : <Text style={{ color: colors.text, fontFamily: fonts.semibold }}>{formatBalance(pending.value, chain.nativeDecimals)} {chain.nativeSymbol}</Text></Text>
                  {pending.dataBytes > 0 ? <Text style={typography.muted}>Données : {pending.dataBytes} octets (appel de contrat)</Text> : null}
                  <Text style={[typography.muted, { marginTop: spacing(1) }]}>⚠️ Vérifie bien : ceci peut déplacer des fonds.</Text>
                </GlassCard>
              )}

              {pending.kind !== 'connect' ? (
                <GlassCard>
                  <Text style={typography.muted}>PIN</Text>
                  <TextInput value={pin} onChangeText={setPin} keyboardType="number-pad" secureTextEntry maxLength={12} editable={!busy} style={{ color: colors.text, fontSize: 20, letterSpacing: 6 }} />
                </GlassCard>
              ) : null}

              {error ? <ErrorBox message={error} /> : null}
              <View style={{ flexDirection: 'row', gap: spacing(1.5) }}>
                <View style={{ flex: 1 }}><Button label="Refuser" variant="ghost" onPress={deny} /></View>
                <View style={{ flex: 1 }}><Button label={busy ? 'Signature…' : pending.kind === 'connect' ? 'Connecter' : 'Signer'} loading={busy} onPress={approve} /></View>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

/** Bouton de la barre d'outils (icône, désactivable, chevron « flip » = retour). */
function ToolBtn({ icon, onPress, disabled, flip }: { icon: Parameters<typeof Icon>[0]['name']; onPress: () => void; disabled?: boolean; flip?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={6} style={({ pressed }) => ({ padding: spacing(1), opacity: disabled ? 0.3 : pressed ? 0.5 : 1 })}>
      <View style={flip ? { transform: [{ rotate: '180deg' }] } : undefined}>
        <Icon name={icon} size={24} color={colors.text} />
      </View>
    </Pressable>
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

/** Logo d'un site : favicon HD, repli sur une pastille (emoji/lettre) si échec. */
function Favicon({ host, size, color, label, emoji }: { host: string; size: number; color: string; label?: string; emoji?: string }) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const r = size / 2;
  if (failed || !host) {
    return (
      <View style={{ width: size, height: size, borderRadius: r, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: size * 0.5, color: colors.text }}>{emoji ?? label ?? '◈'}</Text>
      </View>
    );
  }
  return <Image source={{ uri: faviconUrl(host) }} onError={() => setFailed(true)} style={{ width: size, height: size, borderRadius: r, backgroundColor: '#fff' }} />;
}

/** Tuile d'un site populaire : logo + nom. */
function DappTile({ dapp, onPress }: { dapp: Dapp; onPress: () => void }) {
  const { typography } = useTheme();
  return (
    <PressableScale onPress={onPress} style={{ width: '30%' }}>
      <GlassCard style={{ alignItems: 'center', paddingVertical: spacing(2), paddingHorizontal: spacing(0.5), gap: 8 }}>
        <Favicon host={dapp.domain} size={44} color={dapp.color} emoji={dapp.emoji} />
        <Text style={[typography.bodyStrong, { fontSize: 12.5 }]} numberOfLines={1}>{dapp.name}</Text>
      </GlassCard>
    </PressableScale>
  );
}

/** Bandeau vert rassurant : signature = gratuite (aucun frais de réseau). */
function FreeSignature() {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing(1) }}>
      <Text style={{ fontSize: 13 }}>🔒</Text>
      <Text style={{ color: colors.up, fontSize: 13, fontFamily: fonts.semibold }}>Cette signature est gratuite (aucun frais).</Text>
    </View>
  );
}
