/**
 * Accueil Kalyx (§4.1) — solde agrégé multi-chaîne à GAUCHE avec le halo à
 * droite, variation du jour, graphique de valeur (période au choix, scrub
 * avec haptique), actions Recevoir / Envoyer / Swap, puis Tokens · NFT ·
 * Activité. Pas de sélecteur de réseau ici : le détail par chaîne vit dans
 * la page du token.
 *
 * Vitesse perçue : cache affiché immédiatement (usePortfolioStore.hydrate),
 * puis mise à jour en silence. 5 états : chargement (skeleton), normal, vide,
 * erreur (bandeau), hors ligne (OfflineBanner global).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Pressable, RefreshControl, ScrollView, Alert, Image, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppTabBar } from '../ui/tabs';
import { MarketPanel } from '../ui/MarketPanel';
import { NftDetailModal } from '../ui/NftDetailModal';
import { InteractiveChart } from '../ui/InteractiveChart';
import { Icon } from '../ui/icon';
import { useTheme } from '../ui/theme';
import { space, SCREEN_MARGIN, radius } from '../ui/tokens';
import { Text, Button, IconButton, Surface, Divider, TokenRow, TokenIcon, AddressGlyph, AmountDisplay, SegmentedControl, Skeleton, EmptyState, Halo, ActivityRow, Pressable as KPressable } from '../ui/kit';
import { useWallet } from '../lib/walletStore';
import { useSettings, useT, fiatSymbol } from '../lib/settingsStore';
import { useNotifCenter, unreadCount } from '../lib/notificationCenter';
import { usePortfolioStore, splitHoldings, verifiedSymbols, portfolioHistory, loadAllNfts, PERIODS, type Period, type Holding, type ChainNft } from '../lib/portfolio';
import { useContacts } from '../lib/contactsStore';
import { haptic } from '../lib/haptics';
import { toast } from '../lib/toast';
import { isDeviceCompromised } from '../lib/deviceSecurity';
import { IS_BETA } from '../lib/appStage';
import { getAdapter, listChains, chainIconUrl, formatFiat, formatTokenAmount, humanizeTx, type TxSummary, type ChartPoint, type NftItem } from '../src';

const HIDE_KEY = 'kalyx.hideBalance';
type Tab = 'tokens' | 'nft' | 'activity';

const LANG_LOCALES: Record<string, string> = {
  en: 'en-US',
  fr: 'fr-FR',
  es: 'es-ES',
  pt: 'pt-BR',
  de: 'de-DE',
  it: 'it-IT',
  nl: 'nl-NL',
  pl: 'pl-PL',
  tr: 'tr-TR',
  ru: 'ru-RU',
  ar: 'ar-SA',
  hi: 'hi-IN',
  zh: 'zh-CN',
  ja: 'ja-JP',
  ko: 'ko-KR',
};

function fmtDate(t: number, period: Period, locale = 'en-US'): string {
  const d = new Date(t);
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const day = d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  return period === '1J' || period === '1S' ? `${day} · ${time}` : d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: period === '1M' ? undefined : '2-digit' });
}

export default function Home() {
  const { colors } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const { width: windowW } = useWindowDimensions();
  // Largeur RÉELLE du conteneur (mesurée) : ne dépend pas de la fenêtre système
  // (edge-to-edge, écrans pliables, zoom d'affichage…) → rien ne déborde ni ne se fait clipper.
  const [layoutW, setLayoutW] = useState(0);
  const screenW = layoutW || windowW;
  const account = useWallet((s) => s.account);
  const accounts = useWallet((s) => s.accounts);
  const activeAccountIndex = useWallet((s) => s.activeAccountIndex);
  const activeChain = useWallet((s) => s.activeChain);
  const fiat = useSettings((s) => s.fiat);
  const backupVerified = useSettings((s) => s.backupVerified);
  const language = useSettings((s) => s.language);
  const locale = LANG_LOCALES[language] || 'en-US';
  const unread = useNotifCenter((s) => unreadCount(s.items));
  const stored = accounts.find((a) => a.index === activeAccountIndex) ?? accounts[0];
  const acct = useMemo(() => (stored ? { evmAddress: stored.evmAddress, solAddress: stored.solAddress, btcAddress: stored.btcAddress } : null), [stored]);

  const periodLabels: Record<Period, string> = {
    '1J': t('period1D'),
    '1S': t('period1W'),
    '1M': t('period1M'),
    '1A': t('period1Y'),
    'Tout': t('periodAll'),
  };

  const pf = usePortfolioStore();
  const [hidden, setHidden] = useState(false);
  const [tab, setTab] = useState<Tab>('tokens');
  const [period, setPeriod] = useState<Period>('1S');
  const [points, setPoints] = useState<ChartPoint[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [scrub, setScrub] = useState<ChartPoint | null>(null);
  const [showSmall, setShowSmall] = useState(false);
  const [recent, setRecent] = useState<TxSummary[] | null>(null);
  const [recentError, setRecentError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [nfts, setNfts] = useState<ChainNft[] | null>(null);
  const [openNft, setOpenNft] = useState<ChainNft | null>(null);
  const contacts = useContacts((s) => s.contacts);

  // Cache d'abord (instantané), puis réseau.
  useEffect(() => {
    if (!acct) return;
    pf.hydrate(acct, fiat).then(() => pf.refresh(acct, fiat));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acct?.evmAddress, acct?.solAddress, fiat]);

  // Solde masqué : mémorisé.
  useEffect(() => {
    AsyncStorage.getItem(HIDE_KEY).then((v) => setHidden(v === '1')).catch(() => {});
  }, []);
  const toggleHidden = () => {
    haptic.light();
    setHidden((h) => {
      AsyncStorage.setItem(HIDE_KEY, h ? '0' : '1').catch(() => {});
      return !h;
    });
  };

  // Courbe de valeur pour la période.
  useEffect(() => {
    let alive = true;
    if (!pf.key || pf.holdings.length === 0) {
      setPoints([]);
      return;
    }
    setChartLoading(true);
    portfolioHistory(pf.holdings, fiat, period, pf.key)
      .then((p) => alive && setPoints(p))
      .catch(() => alive && setPoints([]))
      .finally(() => alive && setChartLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pf.key, pf.at, period, fiat]);

  // Activité récente (réseau actif — source de l'écran Historique).
  useEffect(() => {
    let alive = true;
    setRecent(null);
    setRecentError(false);
    if (!account) return;
    const historyChains = listChains({ includeTestnets: false });
    const addressFor = (family: string) => family === 'solana' ? acct?.solAddress : family === 'bitcoin' ? acct?.btcAddress : acct?.evmAddress;
    Promise.all(historyChains.map(async (chain) => {
      const address = addressFor(chain.family);
      return address ? getAdapter(chain.id).getHistory(address) : [];
    }))
      .then((lists) => {
        if (!alive) return;
        const unique = new Map<string, TxSummary>();
        lists.flat().forEach((tx) => unique.set(tx.hash, tx));
        setRecent([...unique.values()].sort((a, b) => b.timestamp - a.timestamp).slice(0, 5));
      })
      .catch(() => {
        if (!alive) return;
        setRecent([]);
        setRecentError(true);
      });
    return () => {
      alive = false;
    };
  }, [account, acct?.evmAddress, acct?.solAddress, acct?.btcAddress]);

  // NFT agrégés (chargés à l'ouverture de l'onglet).
  useEffect(() => {
    if (tab !== 'nft' || !acct || nfts !== null) return;
    loadAllNfts(acct).then(setNfts).catch(() => setNfts([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, acct?.evmAddress]);

  const onRefresh = useCallback(async () => {
    if (!acct) return;
    haptic.light();
    setRefreshing(true);
    try {
      await pf.refresh(acct, fiat, { force: true });
      if (tab === 'nft') setNfts(await loadAllNfts(acct).catch(() => []));
    } finally {
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acct, fiat]);

  // Avertissements uniques (bêta, appareil rooté, réseaux perso à restaurer).
  useEffect(() => {
    if (isDeviceCompromised()) toast.warning(t("deviceInsecureTitle"), t("deviceInsecureDesc"));
    AsyncStorage.getItem('nova.betaSeen').then((seen) => {
      const next = () =>
        AsyncStorage.getItem('nova.promptRestoreNetworks').then((v) => {
          if (!v) return;
          AsyncStorage.removeItem('nova.promptRestoreNetworks');
          Alert.alert(t("customNetworksPromptTitle"), t("customNetworksPromptDesc"), [
            { text: t("actionLater"), style: 'cancel' },
            { text: t("actionRestore"), onPress: () => router.push('/developer') },
          ]);
        });
      if (seen || !IS_BETA) return void next();
      Alert.alert(t("betaTitle"), t("betaDesc"), [
        { text: t("actionUnderstood"), onPress: () => { AsyncStorage.setItem('nova.betaSeen', '1'); void next(); } },
      ]);
    });
  }, []);

  if (!account || !stored) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  const sym = fiatSymbol(fiat);
  const initialLoading = pf.loading && pf.at === 0;
  const { main, small, hidden: unverified } = splitHoldings(pf.holdings);
  const vSymbols = verifiedSymbols(pf.holdings);
  const priceBySymbol = new Map(pf.holdings.filter((h) => h.verified && h.price > 0).map((h) => [h.symbol.toUpperCase(), h.price]));
  const nameOf = (a: string) => {
    const l = a.toLowerCase();
    if (accounts.some((x) => x.evmAddress.toLowerCase() === l || x.solAddress?.toLowerCase() === l)) return 'toi';
    return contacts.find((c) => c.address.toLowerCase() === l)?.name;
  };
  const humanCtx = {
    nativeSymbol: getAdapter(activeChain).config.nativeSymbol,
    nativeDecimals: getAdapter(activeChain).config.nativeDecimals,
    nameOf,
    verifiedSymbols: vSymbols,
    fiatOf: (symbol: string, amount: number) => {
      const p = priceBySymbol.get(symbol.toUpperCase());
      return p ? `${formatFiat(amount * p)} ${sym}` : undefined;
    },
  };
  const mood: 'up' | 'down' | 'flat' = pf.pnl24h == null ? 'flat' : pf.pnl24h >= 0 ? 'up' : 'down';
  const shownValue = scrub ? scrub.v : pf.total;
  const pnlUp = (pf.pnl24h ?? 0) >= 0;
  const chartWidth = screenW - SCREEN_MARGIN * 2;

  const openHolding = (h: Holding) => {
    if (h.kind === 'native' && h.coingeckoId) return router.push({ pathname: '/token/[id]', params: { id: h.coingeckoId, chain: h.chainId } });
    if (!h.verified) {
      return Alert.alert(t("unverifiedTokenTitle"), t('unverifiedTokenDesc').replace('${h.name}', h.name).replace('${h.symbol}', h.symbol), [{ text: t("actionUnderstoodShort") }]);
    }
    const sendParams = h.kind === 'spl' ? { mint: h.contract!, symbol: h.symbol, decimals: String(h.decimals), chain: h.chainId } : { contract: h.contract!, symbol: h.symbol, decimals: String(h.decimals), chain: h.chainId };
    Alert.alert(`${h.symbol} · ${getAdapter(h.chainId).config.name}`, `${formatTokenAmount(h.raw, h.decimals)} ${h.symbol}`, [
      { text: t("actionSend"), onPress: () => { useWallet.getState().setActiveChain(h.chainId); router.push({ pathname: '/send', params: sendParams }); } },
      { text: t("actionSwap"), onPress: () => { useWallet.getState().setActiveChain(h.chainId); router.push({ pathname: '/swap', params: { contract: h.contract! } }); } },
      { text: t("actionCancel"), style: 'cancel' },
    ]);
  };

  return (
    <View style={{ flex: 1, alignSelf: 'stretch', backgroundColor: colors.bg }} onLayout={(e) => setLayoutW(e.nativeEvent.layout.width)}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Halo HORS du ScrollView (sinon Android le clippe au bord droit) — derrière le solde. */}
      {/* Entièrement DANS l'écran horizontalement : Android clippe au bord → un halo qui
          déborde y laissait une coupure verticale nette (« boîte centrale »). */}
      {!hidden ? <Halo size={300} mood={mood} style={{ position: 'absolute', right: 0, top: insets.top - 70 }} /> : null}
      <ScrollView
        style={{ flex: 1, alignSelf: 'stretch' }}
        contentContainerStyle={{ paddingTop: insets.top + space[2], paddingHorizontal: SCREEN_MARGIN, paddingBottom: insets.bottom + 120, gap: space[6] }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textSecondary} colors={[colors.textSecondary]} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── En-tête : compte ▾ · recherche · réglages ── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <KPressable onPress={() => router.push('/accounts')} accessibilityLabel={t("a11ySwitchAccount")} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[2], height: 48 }}>
            <AddressGlyph address={stored.evmAddress} size={32} />
            <Text variant="body" numberOfLines={1} style={{ flexShrink: 1, minWidth: 0 }}>{stored.label}</Text>
            <Icon name="caretDown" size={14} tone="muted" />
          </KPressable>
          {/* Réseau actif (Envoyer / Swap / dApps) : un tap ouvre le sélecteur. */}
          <KPressable
            onPress={() => router.push('/networks')}
            accessibilityLabel={`${t('network')} : ${getAdapter(activeChain).config.name}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: space[2], borderRadius: radius.round, backgroundColor: colors.surface2, maxWidth: 150 }}
          >
            {chainIconUrl(activeChain) ? <Image source={{ uri: chainIconUrl(activeChain) }} style={{ width: 16, height: 16, borderRadius: 8 }} /> : null}
            <Text variant="caption" numberOfLines={1} style={{ flexShrink: 1 }}>{getAdapter(activeChain).config.name}</Text>
            <Icon name="caretDown" size={12} tone="muted" />
          </KPressable>
          <View>
            <IconButton icon="bell" label={t("labelNotifications")} tone="ghost" onPress={() => router.push('/notifications')} />
            {unread > 0 ? <View style={{ position: 'absolute', top: 10, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.warning }} /> : null}
          </View>
          <IconButton icon="menu" label={t("labelMenu")} tone="ghost" onPress={() => router.push('/menu')} />
        </View>

        {/* Sauvegarde sautée : bandeau permanent (§4.9) */}
        {!backupVerified ? (
          <KPressable onPress={() => router.push('/reveal-phrase')} style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], padding: space[3], borderRadius: 12, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.warning }}>
            <Icon name="warning" size={18} color={colors.warning} />
            <Text variant="caption" style={{ flex: 1 }}>{t("unverifiedBackupWarning")}</Text>
            <Icon name="chevron" size={14} tone="muted" />
          </KPressable>
        ) : null}

        {/* ── Solde (le halo est derrière, au niveau de l'écran) ── */}
        <View>
          <Pressable onLongPress={toggleHidden} delayLongPress={350} accessibilityLabel={hidden ? t("a11yHiddenBalance") : t("a11yVisibleBalance")}>
            {initialLoading ? (
              <Skeleton width={220} height={52} />
            ) : hidden ? (
              <Text variant="balance">••••••</Text>
            ) : scrub ? (
              <Text variant="balance" tabular>{formatFiat(shownValue)} <Text variant="title2" tone="secondary">{sym}</Text></Text>
            ) : (
              <AmountDisplay value={formatFiat(pf.total)} suffix={sym} />
            )}
          </Pressable>
          <View style={{ height: 22, justifyContent: 'center', marginTop: space[1] }}>
            {scrub ? (
              <Text variant="caption" tone="secondary">{fmtDate(scrub.t, period, locale)}</Text>
            ) : hidden || initialLoading ? null : pf.pnl24h != null ? (
              <Text variant="caption" tone={pnlUp ? 'up' : 'down'} tabular>
                {pnlUp ? '↑ +' : '↓ −'}{formatFiat(Math.abs(pf.pnl24h))} {sym} · {t("today")}{pf.pnl24hPct != null ? ` (${pnlUp ? '+' : '−'}${Math.abs(pf.pnl24hPct).toFixed(1).replace('.', ',')} %)` : ''}
              </Text>
            ) : (
              <Text variant="caption" tone="tertiary">{pf.fromCache ? t("updating") : ' '}</Text>
            )}
          </View>
        </View>

        {/* ── Graphique + périodes ── */}
        <View style={{ gap: space[3] }}>
          {points.length > 1 && !hidden ? (
            <InteractiveChart points={points} color={mood === 'down' ? colors.down : colors.up} width={chartWidth} height={150} onScrub={(p) => { if (p && scrub?.t !== p.t) haptic.selection(); setScrub(p); }} />
          ) : (
            <View style={{ height: 150, alignItems: 'center', justifyContent: 'center' }}>
              {chartLoading || initialLoading ? <Skeleton width="100%" height={150} /> : <Text variant="caption" tone="tertiary">{hidden ? ' ' : t("noHistoryYet")}</Text>}
            </View>
          )}
          <SegmentedControl items={PERIODS.map((p) => ({ key: p, label: periodLabels[p] || p }))} value={period} onChange={setPeriod} />
        </View>

        {/* ── Actions ── */}
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <Button label={t("actionReceive")} icon="receive" variant="secondary" size="md" dense style={{ flex: 1 }} onPress={() => router.push('/receive')} />
          <Button label={t("actionSend")} icon="send" variant="primary" size="md" dense style={{ flex: 1 }} onPress={() => router.push('/send')} />
          <Button label="Swap" icon="exchange" variant="secondary" size="md" dense style={{ flex: 1 }} onPress={() => router.push('/swap')} />
        </View>

        {/* ── Tokens · NFT · Activité ── */}
        <View style={{ gap: space[3] }}>
          <SegmentedControl items={[{ key: 'tokens', label: t("tabTokens") }, { key: 'nft', label: t("tabNft") }, { key: 'activity', label: t("tabActivity") }]} value={tab} onChange={setTab} />

          {tab === 'tokens' ? (
            initialLoading ? (
              <Surface padded={false}>
                {[0, 1, 2].map((i) => (
                  <View key={i} style={{ height: 64, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4] }}>
                    <Skeleton width={40} height={40} round />
                    <View style={{ flex: 1, gap: space[2] }}><Skeleton width="50%" /><Skeleton width="30%" height={12} /></View>
                    <Skeleton width={72} />
                  </View>
                ))}
              </Surface>
            ) : pf.holdings.length === 0 ? (
              <Surface>
                <EmptyState icon="receive" title={t("emptyTokensTitle")} body={t("emptyTokensBody")} actionLabel={t("actionReceive")} onAction={() => router.push('/receive')} />
                {pf.error ? <Text variant="caption" tone="warning" style={{ textAlign: 'center' }}>{pf.error}</Text> : null}
              </Surface>
            ) : (
              <>
                <Surface padded={false}>
                  {(showSmall ? [...main, ...small] : main).map((h, i, arr) => (
                    <React.Fragment key={h.id}>
                      <TokenRow
                        symbol={h.symbol}
                        name={`${h.name} · ${getAdapter(h.chainId).config.name}`}
                        logo={h.kind === 'native' ? chainIconUrl(h.chainId) : h.logo}
                        address={h.contract ?? h.chainId}
                        balance={`${formatTokenAmount(h.raw, h.decimals)} ${h.symbol}`}
                        fiat={h.price > 0 ? `${formatFiat(h.fiat)} ${sym}` : undefined}
                        changePct={h.change24h}
                        hidden={hidden}
                        onPress={() => openHolding(h)}
                      />
                      {i < arr.length - 1 ? <Divider inset={68} /> : null}
                    </React.Fragment>
                  ))}
                </Surface>
                {small.length > 0 ? (
                  <KPressable onPress={() => setShowSmall((v) => !v)} style={{ alignSelf: 'center', paddingVertical: space[2] }}>
                    <Text variant="caption" tone="secondary">{showSmall ? t("hideSmallBalances") : t('showSmallBalances').replace('${small.length}', small.length.toString())}</Text>
                  </KPressable>
                ) : null}
                {unverified.length > 0 ? (
                  <View style={{ gap: space[2] }}>
                    <KPressable onPress={() => setShowHidden((v) => !v)} style={{ alignSelf: 'center', paddingVertical: space[1] }}>
                      <Text variant="caption" tone="tertiary">{showHidden ? t("hideUnverifiedTokens") : t('showUnverifiedTokens').replace('${unverified.length}', unverified.length.toString())}</Text>
                    </KPressable>
                    {showHidden ? (
                      <Surface padded={false} style={{ opacity: 0.75 }}>
                        {unverified.map((h, i) => (
                          <React.Fragment key={h.id}>
                            <KPressable noScale onPress={() => openHolding(h)}>
                              <View style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4] }}>
                                <TokenIcon symbol={h.symbol} seed={h.contract ?? h.symbol} />
                                <View style={{ flex: 1, minWidth: 0 }}>
                                  <Text variant="body" tone="secondary" numberOfLines={1}>{h.name} · {getAdapter(h.chainId).config.name}</Text>
                                  <Text variant="caption" tone="warning">{t("unverifiedBadge")}</Text>
                                </View>
                                <Text variant="caption" tone="tertiary" tabular>{formatTokenAmount(h.raw, h.decimals)} {h.symbol}</Text>
                              </View>
                            </KPressable>
                            {i < unverified.length - 1 ? <Divider inset={68} /> : null}
                          </React.Fragment>
                        ))}
                      </Surface>
                    ) : null}
                  </View>
                ) : null}
                {pf.error ? <Text variant="caption" tone="warning" style={{ textAlign: 'center' }}>{t("updateFailed")}{new Date(pf.at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</Text> : null}
                {/* Le marché vit ici (plus d'onglet) : hausses / baisses du jour, puis l'écran complet. */}
                <MarketPanel />
              </>
            )
          ) : tab === 'nft' ? (
            nfts === null ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} width={(screenW - SCREEN_MARGIN * 2 - space[3]) / 2} height={(screenW - SCREEN_MARGIN * 2 - space[3]) / 2} />)}</View>
            ) : nfts.length === 0 ? (
              <Surface><EmptyState icon="nft" title={t("emptyNftTitle")} body={t("emptyNftBody")} actionLabel={t("actionReceive")} onAction={() => router.push('/receive')} /></Surface>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
                {nfts.map((n) => {
                  const w = (screenW - SCREEN_MARGIN * 2 - space[3]) / 2;
                  return (
                    <KPressable key={`${n.chainId}:${n.contract}:${n.tokenId}`} onPress={() => setOpenNft(n)} style={{ width: w, gap: space[1] }} accessibilityLabel={n.name}>
                      <View style={{ width: w, height: w, borderRadius: 12, backgroundColor: colors.surface2, overflow: 'hidden' }}>
                        {n.image ? <Image source={{ uri: n.image }} style={{ width: w, height: w }} resizeMode="cover" /> : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Icon name="nft" size={28} tone="faint" /></View>}
                        <View style={{ position: 'absolute', right: 6, bottom: 6, width: 18, height: 18, borderRadius: 9, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                          {chainIconUrl(n.chainId) ? <Image source={{ uri: chainIconUrl(n.chainId) }} style={{ width: 12, height: 12, borderRadius: 6 }} /> : null}
                        </View>
                      </View>
                      <Text variant="caption" numberOfLines={1}>{n.name}</Text>
                      <Text variant="micro" tone="tertiary" numberOfLines={1}>{n.collection}</Text>
                    </KPressable>
                  );
                })}
              </View>
            )
          ) : recent === null ? (
            <Surface padded={false}>{[0, 1, 2].map((i) => <View key={i} style={{ height: 64, paddingHorizontal: space[4], justifyContent: 'center' }}><Skeleton width="70%" /></View>)}</Surface>
          ) : recentError ? (
            <Surface>
              <EmptyState icon="warning" title={t("activityUnavailableTitle")} body={t("activityUnavailableBody")} />
            </Surface>
          ) : recent.length === 0 ? (
            <Surface>
              <EmptyState icon="history" title={t("emptyActivityTitle")} body={t("emptyActivityBody")} />
            </Surface>
          ) : (
            <>
              <Surface padded={false}>
                {recent.map((tx) => ({ tx, h: humanizeTx(tx, humanCtx) })).filter((r) => !r.h.spam).slice(0, 5).map((r, i, arr) => (
                  <React.Fragment key={r.tx.hash}>
                    <ActivityRow h={r.h} time={new Date(r.tx.timestamp * 1000).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })} onPress={() => router.push('/history')} />
                    {i < arr.length - 1 ? <Divider inset={68} /> : null}
                  </React.Fragment>
                ))}
              </Surface>
              <KPressable onPress={() => router.push('/history')} style={{ alignSelf: 'center', paddingVertical: space[2] }}>
                <Text variant="caption" tone="secondary">{t("fullHistory")}</Text>
              </KPressable>
            </>
          )}
        </View>
      </ScrollView>
      {/* Fond opaque sous la barre d'état : le contenu ne passe plus « dessous » au scroll. */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, backgroundColor: colors.bg }} />
      <NftDetailModal nft={openNft as NftItem | null} explorerUrl={openNft ? getAdapter(openNft.chainId).config.explorerUrl : undefined} onClose={() => setOpenNft(null)} />
      <AppTabBar active="home" />
    </View>
  );
}
