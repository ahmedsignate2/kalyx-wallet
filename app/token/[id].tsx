import { LogoImage, ScreenHeader, Pressable as KPressable, Button, TokenIcon, Skeleton } from '../../ui/kit';
import { fill } from '../../lib/i18n';
import { SafeModal } from '../../ui/kit/SafeModal';
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, useWindowDimensions, TextInput, KeyboardAvoidingView, Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import {
  PremiumScreen,
  GlassCard,
  SegmentedTabs,
  CircleAction,
} from '../../ui/premium';
import { Halo } from '../../ui/kit/Halo';
import { ActionDisc, GOLD, NovaCard, Orbit, Pills, Rise, SectionLabel } from '../../ui/nova';
import { TxRow } from '../../ui/TxRow';
import { InteractiveChart } from '../../ui/InteractiveChart';
import { Icon } from '../../ui/icon';
import { fonts, spacing, useTheme } from '../../ui/theme';
import { useSettings, useT, fiatSymbol } from '../../lib/settingsStore';
import { toast } from '../../lib/toast';
import { useWallet } from '../../lib/walletStore';
import { addressForChain } from '../../lib/accountAddress';
import { usePortfolioStore, type Holding } from '../../lib/portfolio';
import { usePriceAlerts } from '../../lib/priceAlertsStore';
import {
  getCoinDetail,
  getMarketChartPoints,
  CHART_PERIODS,
  ALL_CHAINS,
  type CoinDetail,
  type ChartPeriod,
  type ChartPoint,
  formatFiat,
  formatTokenAmount,
  getAdapter,
  chainIconUrl,
  assessToken,
  formatPercent,
  formatNumber,
  shortAddress,
} from '../../src';

const money = formatFiat;
function compact(v: number): string {
  if (v >= 1e12) return `${(v / 1e12).toFixed(2)} T`;
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)} Md`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)} M`;
  return money(v, 0);
}

/** Date du point scrubbé, formatée selon la période (heure pour 24h, date sinon). */
function formatScrubDate(ts: number, period: string): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const dm = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  if (period === '24h') return `${dm} · ${hm}`;
  if (period === '7j' || period === '1m') return `${dm} · ${hm}`;
  return `${dm}/${d.getFullYear()}`;
}

/** Libellé seul, sans « : » ni emplacement (« Market cap: » → « Market cap »). */
function labelOf(s: string): string {
  return s.replace(/\s*\{\w+\}\s*$/, '').replace(/\s*[:：]\s*$/, '').trim();
}

/** Grand nombre sans devise : 19,8 M, 120 Md. */
function compactNumber(v: number): string {
  if (v >= 1e12) return `${formatNumber(v / 1e12)} T`;
  if (v >= 1e9) return `${formatNumber(v / 1e9)} Md`;
  if (v >= 1e6) return `${formatNumber(v / 1e6)} M`;
  return formatNumber(v);
}

/** Tuile de statistique (marché) : libellé discret, valeur en avant. */
function StatTile({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  const { colors, typography } = useTheme();
  return (
    <View style={{ flexBasis: wide ? '100%' : '48%', flexGrow: 1, padding: spacing(1.75), borderRadius: 20, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.border, gap: 4 }}>
      <Text style={typography.muted} numberOfLines={1}>{label}</Text>
      <Text style={[typography.bodyStrong, { fontVariant: ['tabular-nums'] }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

/** Ligne libellé → valeur d'une carte d'informations ; touchable si `onPress`. */
function InfoRow({ label, right, divider, onPress, a11y }: { label: string; right: React.ReactNode; divider?: boolean; onPress?: () => void; a11y?: string }) {
  const { colors, typography } = useTheme();
  const body = (
    <View style={{ minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing(2), paddingHorizontal: spacing(2), borderTopWidth: divider ? 1 : 0, borderTopColor: colors.border }}>
      <Text style={typography.muted}>{label}</Text>
      <View style={{ flexShrink: 1, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
  return onPress ? <KPressable noScale onPress={onPress} accessibilityLabel={a11y ?? label}>{body}</KPressable> : body;
}

export default function TokenDetail() {
  const { colors, typography } = useTheme();
  const { id, chain: chainParam } = useLocalSearchParams<{ id: string; chain?: string }>();
  const t = useT();
  const { fiat, language, favorites } = useSettings();
  const toggleFavorite = useSettings((s) => s.toggleFavorite);
  const isFav = !!id && favorites.includes(id);
  const setActiveChain = useWallet((s) => s.setActiveChain);
  const account = useWallet((s) => s.account);
  const accounts = useWallet((s) => s.accounts);
  const activeAccountIndex = useWallet((s) => s.activeAccountIndex);
  const portfolio = usePortfolioStore();

  const [detail, setDetail] = useState<CoinDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [failed, setFailed] = useState(false);
  const [period, setPeriod] = useState<ChartPeriod>('7j');
  const [chart, setChart] = useState<ChartPoint[]>([]);
  const [loadingChart, setLoadingChart] = useState(true);
  const [activity, setActivity] = useState<import('../../src').TxSummary[] | null>(null);
  const [activityError, setActivityError] = useState(false);
  const [aboutExpanded, setAboutExpanded] = useState(false);
  const [risk, setRisk] = useState<import('../../src').RiskAssessment | null>(null);
  // Point sous le doigt pendant le scrub du graphique (null = pas de scrub).
  const [scrub, setScrub] = useState<ChartPoint | null>(null);
  // Création d'alerte de prix.
  const addAlert = usePriceAlerts((s) => s.add);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertDir, setAlertDir] = useState<'above' | 'below'>('above');
  const [alertTarget, setAlertTarget] = useState('');

  const openAlert = () => {
    setAlertTarget(detail?.price ? String(detail.price) : '');
    setAlertDir((detail?.change24h ?? 0) >= 0 ? 'above' : 'below');
    setAlertOpen(true);
  };
  const createAlert = () => {
    const target = Number(alertTarget.replace(',', '.'));
    if (!id || !Number.isFinite(target) || target <= 0) { toast.error(t("invalidPriceTitle"), t("invalidPriceDesc")); return; }
    addAlert({ coingeckoId: id, symbol: detail?.symbol || id, direction: alertDir, target });
    setAlertOpen(false);
    toast.success(t("alertCreated"), `${(detail?.symbol || id).toUpperCase()} ${alertDir === 'above' ? '≥' : '≤'} ${target} ${fiatSymbol(fiat)}`);
  };

  // Largeur MESURÉE du conteneur du graphique : il occupe toute la ligne, sans
  // vide à droite, quelles que soient les marges de l'écran.
  const { width } = useWindowDimensions();
  const [chartBox, setChartBox] = useState(0);
  const chartWidth = chartBox || width - spacing(2.5) * 2;

  // Chaîne Kalyx correspondante (si le token est une de nos chaînes natives).
  // Un ID CoinGecko peut représenter plusieurs natifs (ETH sur L2) ; le
  // réseau de la position est donc prioritaire. Bitcoin ne doit jamais tomber
  // sur Bitlayer/Merlin simplement parce qu'ils partagent l'ID « bitcoin ».
  const holding = portfolio.holdings.find((h) =>
    h.id === id || h.coingeckoId === id || h.contract?.toLowerCase() === id?.toLowerCase(),
  );
  // Repli marché : un token pas encore détenu n'a pas de `holding.chainId`, mais
  // CoinGecko donne ses contrats par plateforme (`detail.platforms`). On matche
  // contre `coingeckoPlatform` de nos 60+ chaînes EVM configurées, pour ne plus
  // tomber sur « Marché multi-réseaux » (et bloquer Envoyer/Swap) alors que le
  // réseau est en fait déjà supporté par Kalyx.
  const marketChain = ALL_CHAINS.find(
    (c) => c.family === 'evm' && c.coingeckoPlatform != null && !!detail?.platforms[c.coingeckoPlatform],
  );
  const marketContract = marketChain?.coingeckoPlatform ? detail?.platforms[marketChain.coingeckoPlatform] : undefined;

  const chain = (chainParam ? ALL_CHAINS.find((c) => c.id === chainParam) : undefined)
    ?? (holding ? ALL_CHAINS.find((c) => c.id === holding.chainId) : undefined)
    ?? (id === 'bitcoin' ? ALL_CHAINS.find((c) => c.id === 'bitcoin') : undefined)
    ?? ALL_CHAINS.find((c) => c.coingeckoId === id && c.family !== 'evm')
    ?? marketChain;

  const mounted = React.useRef(true);
  useEffect(() => {
    return () => { mounted.current = false; };
  }, []);

  const loadDetail = React.useCallback(async () => {
    if (!id) return;
    setLoadingDetail(true);
    setFailed(false);
    const d = await getCoinDetail(id, fiat, language);
    if (mounted.current) {
      setDetail(d);
      setFailed(!d);
      setLoadingDetail(false);
    }
  }, [id, fiat, language]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    if (!account?.address) return;
    const state = useWallet.getState();
    const stored = state.accounts.find((a) => a.index === state.activeAccountIndex);
    if (!stored) return;
    const acct = { evmAddress: stored.evmAddress, solAddress: stored.solAddress, btcAddress: stored.btcAddress, tonPublicKey: stored.tonPublicKey, tonVersion: stored.tonVersion };
    portfolio.hydrate(acct, fiat).then(() => portfolio.refresh(acct, fiat));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.address, fiat]);

  useEffect(() => {
    if (!id) return;
    setLoadingChart(true);
    const days = CHART_PERIODS.find((p) => p.key === period)?.days ?? '7';
    getMarketChartPoints(id, fiat, days)
      .then(setChart)
      .catch(() => setChart([]))
      .finally(() => setLoadingChart(false));
  }, [id, period, fiat]);

  useEffect(() => {
    if (!chain) return;
    const stored = accounts.find((a) => a.index === activeAccountIndex) ?? accounts[0];
    const address = addressForChain(stored, chain);
    if (!address) return;
    let alive = true;
    setActivity(null);
    setActivityError(false);
    const isNative = !holding?.contract && (holding?.kind === 'native' || !holding);
    getAdapter(chain.id).getHistory(address)
      .then((txs) => {
        if (!alive) return;
        const symbol = (holding?.symbol ?? detail?.symbol ?? chain.nativeSymbol).toUpperCase();
        const filtered = txs.filter((tx) => isNative
          ? !tx.asset || tx.asset.toUpperCase() === 'NATIVE' || tx.asset.toUpperCase() === symbol
          : tx.asset?.toUpperCase() === symbol);
        setActivity(filtered.slice(0, 4));
      })
      .catch(() => alive && (setActivityError(true), setActivity([])));
    const held = portfolio.holdings.find((h) => h.coingeckoId === id && h.contract && chain.family === 'evm');
    // Pas de position détenue, mais le contrat est connu via la plateforme CoinGecko
    // du marché (`marketContract`) : on peut quand même afficher l'analyse de sécurité.
    const contractToAssess = held?.contract ?? marketContract;
    if (contractToAssess && chain.evmChainId) {
      assessToken(chain.evmChainId, contractToAssess).then((r) => alive && setRisk(r)).catch(() => {});
    } else {
      setRisk(null);
    }
    return () => { alive = false; };
  }, [chain?.id, accounts, activeAccountIndex, detail?.symbol, holding?.contract, holding?.kind, holding?.symbol, marketContract]);

  // La couleur reflète toujours la variation affichée (24 h), jamais une
  // tendance d'une période différente du sélecteur.
  const up = (detail?.change24h ?? 0) >= 0;
  const chartColor = up ? colors.up : colors.down;
  // Prix affiché : celui sous le doigt pendant le scrub, sinon le prix actuel.
  const shownPrice = scrub ? scrub.v : detail?.price ?? 0;
  // Variation depuis le début de la période jusqu'au point scrubbé.
  const scrubChange = scrub && chart.length > 1 && chart[0].v > 0 ? ((scrub.v - chart[0].v) / chart[0].v) * 100 : null;
  const owned = portfolio.holdings.filter((h) => h.coingeckoId === id && h.amount > 0);
  const ownedTotal = owned.reduce((sum, h) => sum + h.fiat, 0);
  const networkLogo = chain ? chainIconUrl(chain.id) : undefined;
  const assetName = detail?.name ?? (loadingDetail ? '…' : id ?? '');
  const networkName = chain?.name;
  // Une fiche liée à une position doit distinguer les L2 qui partagent l'actif
  // ETH avec Ethereum mainnet. On évite seulement le doublon « Bitcoin · Bitcoin ».
  const displayTitle = networkName && assetName !== networkName
    ? `${assetName} · ${networkName}`
    : assetName;
  const displaySymbol = detail?.symbol
    ? `${detail.symbol}${networkName ? ` · ${networkName}` : ''}`
    : '';

  const goSendReceive = (route: '/send' | '/receive') => {
    if (chain) {
      setActiveChain(chain.id);
      // Depuis la page d'un token : token et chaîne connus → on saute « Quoi envoyer ».
      if (route === '/send') {
        const sendParams: Record<string, string> = { chain: chain.id };
        if (holding) {
          if (holding.contract) {
            if (holding.kind === 'spl') sendParams.mint = holding.contract;
            else if (holding.kind === 'jetton') sendParams.jetton = holding.contract;
            else sendParams.contract = holding.contract;
          }
          sendParams.symbol = holding.symbol;
          sendParams.decimals = String(holding.decimals);
        }
        router.push({ pathname: '/send', params: sendParams });
      } else router.push(route);
    } else {
      toast.info(t('network'), t("soonToast"));
    }
  };

  // Logo du JETON (le logo du réseau va en pastille) ; contrat et décimales réels du jeton.
  const tokenLogo = detail?.image || holding?.logo || networkLogo;
  const showBadge = !!networkLogo && !!chain && (!!holding?.contract || !!marketContract || (chain.nativeSymbol === 'ETH' && chain.id !== 'ethereum'));
  const contract = holding?.contract ?? marketContract;
  const decimals = holding?.decimals ?? (contract ? undefined : chain?.nativeDecimals);
  const fiatSym = fiatSymbol(fiat);
  const changeShown = scrub ? scrubChange : detail?.change24h ?? null;
  const changeUp = (changeShown ?? 0) >= 0;
  const explorerHref = chain?.explorerUrl
    ? contract && chain.family === 'evm'
      ? `${chain.explorerUrl.replace(/\/+$/, '')}/token/${contract}`
      : chain.explorerUrl
    : null;
  const copyContract = async () => {
    if (!contract) return;
    await Clipboard.setStringAsync(contract);
    toast.success(t('addressCopied'), shortAddress(contract));
  };
  const periodLabels: Record<string, string> = {
    '24h': t('chartPeriod24h'),
    '7j': t('chartPeriod7d'),
    '30j': t('chartPeriod30d'),
    '1an': t('chartPeriod1y'),
    all: t('periodAll'),
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <PremiumScreen>
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, right: 0, width: 300, height: 300 }}>
        <Orbit cx={210} cy={60} r={120} />
        <Halo
          size={260}
          mood={detail ? (up ? 'up' : 'down') : 'flat'}
          style={{ position: 'absolute', top: -70, left: 80, opacity: 0.75 }}
        />
      </View>
      {/*
        EN-TÊTE UNIQUE. Le nom figurait deux fois (barre, puis rangée du logo) ;
        le favori vit ici, à droite ; l'alerte a son disque sous le graphique
        (la cloche figurait en double, en-tête ET disque).
      */}
      <ScreenHeader
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(2) }}>
            <KPressable
              onPress={() => id && toggleFavorite(id)}
              hitSlop={10}
              haptic="light"
              accessibilityRole="switch"
              accessibilityState={{ checked: isFav }}
              accessibilityLabel={t('favorites')}
            >
              <Icon name={isFav ? 'starFilled' : 'star'} size={23} color={isFav ? GOLD : colors.textSecondary} />
            </KPressable>
          </View>
        }
      />

      {failed ? (
        <GlassCard>
          <Text style={typography.bodyStrong}>{t("failedLoadTokenTitle")}</Text>
          <Text style={typography.muted}>{t("failedLoadTokenDesc")}</Text>
          <Text onPress={loadDetail} style={{ color: colors.primary, fontFamily: fonts.bold, marginTop: spacing(1) }}>{t("actionRetry")}</Text>
        </GlassCard>
      ) : (
        <>
          {/* Identité : logo du jeton (pastille réseau), nom, symbole · réseau. */}
          <Rise style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
            {tokenLogo ? (
              <TokenIcon symbol={detail?.symbol ?? id ?? '?'} logo={tokenLogo} seed={contract ?? id} size={52} badge={showBadge ? networkLogo : null} />
            ) : (
              <Skeleton width={52} height={52} round />
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={typography.section} numberOfLines={1}>{assetName}</Text>
              <Text style={typography.muted} numberOfLines={1}>{displaySymbol || ' '}</Text>
            </View>
          </Rise>

          {/* Prix : grand, puis la variation en pastille colorée (date du point pendant le scrub). */}
          <View style={{ gap: spacing(1) }}>
            {loadingDetail && !scrub ? (
              <Skeleton width={180} height={44} />
            ) : (
              <Text style={typography.hero} numberOfLines={1} adjustsFontSizeToFit>
                {money(shownPrice, shownPrice >= 100 ? 0 : 2)} <Text style={{ color: colors.textSecondary, fontSize: 24 }}>{fiatSym}</Text>
              </Text>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1) }}>
              {changeShown != null ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, height: 28, borderRadius: 14, backgroundColor: changeUp ? 'rgba(52,199,123,0.14)' : 'rgba(255,92,92,0.14)' }}>
                  <Text style={{ color: changeUp ? colors.up : colors.down, fontFamily: fonts.bold, fontSize: 14, fontVariant: ['tabular-nums'] }}>
                    {changeUp ? '↑ +' : '↓ −'}{formatPercent(Math.abs(changeShown))}
                  </Text>
                </View>
              ) : null}
              <Text style={typography.muted}>{scrub ? formatScrubDate(scrub.t, period) : t('today')}</Text>
            </View>
          </View>

          {/* Graphique */}
          <View style={{ gap: spacing(1.5) }}>
            <View style={{ height: 200, justifyContent: 'center' }} onLayout={(e) => setChartBox(Math.round(e.nativeEvent.layout.width))}>
              {loadingChart && chart.length === 0 ? (
                <Skeleton height={160} />
              ) : chart.length < 2 ? (
                <Text style={[typography.muted, { textAlign: 'center' }]}>{t("noChartData")}</Text>
              ) : (
                <InteractiveChart points={chart} color={chartColor} width={chartWidth} onScrub={setScrub} />
              )}
            </View>
            <Pills
              items={CHART_PERIODS.map((p) => ({ key: p.key, label: periodLabels[p.key] || p.label }))}
              value={period}
              onChange={(k) => setPeriod(k as ChartPeriod)}
            />
          </View>

          {/* Actions : les mêmes disques que l'accueil. */}
          <View style={{ flexDirection: 'row', gap: spacing(1) }}>
            <ActionDisc index={0} tone="primary" icon="send" label={t('send')} disabled={chain?.family === 'bitcoin'} onPress={() => goSendReceive('/send')} />
            <ActionDisc index={1} icon="receive" label={t('receive')} onPress={() => goSendReceive('/receive')} />
            <ActionDisc index={2} icon="exchange" label={t('actionSwap')} onPress={() => router.push({ pathname: '/swap', params: { to: detail?.symbol ?? '' } })} />
            <ActionDisc index={3} tone="gold" icon="bell" label={t('actionAlert')} onPress={openAlert} />
          </View>

          {/* Ta position : valeur, puis le détail par réseau. */}
          {owned.length > 0 ? (
            <>
              <SectionLabel>{t('yourBalance')}</SectionLabel>
              <NovaCard>
                <Text style={[typography.hero, { fontSize: 34, lineHeight: 40 }]} numberOfLines={1} adjustsFontSizeToFit>
                  {money(ownedTotal, 2)} <Text style={{ color: colors.textSecondary, fontSize: 20 }}>{fiatSym}</Text>
                </Text>
                {owned.map((h: Holding, i) => (
                  <View key={h.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.25), paddingTop: spacing(1.5), marginTop: i === 0 ? spacing(1.5) : 0, borderTopWidth: i === 0 ? 1 : 0, borderTopColor: colors.border }}>
                    {chainIconUrl(h.chainId) ? <LogoImage uri={chainIconUrl(h.chainId)!} size={24} /> : null}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={typography.body} numberOfLines={1}>{formatTokenAmount(h.raw, h.decimals)} {h.symbol}</Text>
                      <Text style={typography.muted} numberOfLines={1}>{ALL_CHAINS.find((c) => c.id === h.chainId)?.name ?? h.chainId}</Text>
                    </View>
                    <Text style={[typography.body, { fontVariant: ['tabular-nums'] }]}>{money(h.fiat, 2)} {fiatSym}</Text>
                  </View>
                ))}
              </NovaCard>
            </>
          ) : null}

          {/* Marché : des tuiles, plus des lignes de texte gris. */}
          {detail ? (
            <>
              <SectionLabel>{t('marketDetailsTitle')}</SectionLabel>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1) }}>
                {detail.marketCap > 0 ? <StatTile label={labelOf(t('marketCapLabel'))} value={`${compact(detail.marketCap)} ${fiatSym}`} /> : null}
                {detail.volume24h > 0 ? <StatTile label={labelOf(t('volume24hLabel'))} value={`${compact(detail.volume24h)} ${fiatSym}`} /> : null}
                {detail.ath > 0 ? <StatTile label="ATH" value={`${money(detail.ath)} ${fiatSym}`} /> : null}
                {detail.atl > 0 ? <StatTile label="ATL" value={`${money(detail.atl)} ${fiatSym}`} /> : null}
                {detail.circulatingSupply > 0 ? <StatTile label={labelOf(t('circulatingSupplyLabel'))} value={compactNumber(detail.circulatingSupply)} wide /> : null}
              </View>
            </>
          ) : null}

          {/* Jeton : réseau, contrat (copiable), décimales, explorateur — et la sécurité, en badge. */}
          <SectionLabel>{t('tokenDetailsTitle')}</SectionLabel>
          <NovaCard padded={false}>
            <InfoRow label={labelOf(t('networkLabel'))} right={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {networkLogo ? <LogoImage uri={networkLogo} size={18} /> : null}
                <Text style={typography.body}>{chain?.name ?? t('multiChainMarket')}</Text>
              </View>
            } />
            {contract ? (
              <InfoRow divider label={t('contractLabel')} onPress={copyContract} a11y={t('copyAddress')} right={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[typography.body, { fontVariant: ['tabular-nums'] }]}>{shortAddress(contract)}</Text>
                  <Icon name="copy" size={15} color={colors.textSecondary} />
                </View>
              } />
            ) : null}
            {decimals != null ? <InfoRow divider label={labelOf(t('decimalsLabel'))} right={<Text style={typography.body}>{decimals}</Text>} /> : null}
            <InfoRow divider label={t('securityTitle')} right={
              risk ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 26, borderRadius: 13, backgroundColor: risk.level === 'danger' ? 'rgba(255,92,92,0.14)' : 'rgba(52,199,123,0.14)' }}>
                  <Icon name={risk.level === 'danger' ? 'warning' : 'check'} size={13} color={risk.level === 'danger' ? colors.danger : colors.up} />
                  <Text style={{ color: risk.level === 'danger' ? colors.danger : colors.up, fontFamily: fonts.semibold, fontSize: 13 }}>{risk.level === 'danger' ? t('securityRisk') : t('securitySafe')}</Text>
                </View>
              ) : (
                <Text style={[typography.muted, { flexShrink: 1, textAlign: 'right' }]} numberOfLines={2}>{t('securityUnavailable')}</Text>
              )
            } />
            {explorerHref ? (
              <InfoRow divider label={t('viewOnExplorer')} onPress={() => Linking.openURL(explorerHref).catch(() => {})} a11y={t('viewOnExplorer')} right={<Icon name="chevron" size={16} color={colors.textSecondary} />} />
            ) : null}
          </NovaCard>
          {risk?.level === 'danger' && risk.reasons.length > 0 ? (
            <Text style={[typography.muted, { color: colors.danger, marginTop: -spacing(1) }]}>{risk.reasons.map((r) => t(r as never) || r).join(' · ')} · {t('goplusAnalysis')}</Text>
          ) : null}

          {/* À propos */}
          {detail?.description ? (
            <>
              <SectionLabel>{fill(t('aboutTokenTitle'), { name: detail.name })}</SectionLabel>
              <NovaCard>
                <Text numberOfLines={aboutExpanded ? undefined : 5} style={[typography.muted, { lineHeight: 21 }]}>{detail.description}</Text>
                {detail.description.length > 320 ? (
                  <KPressable onPress={() => setAboutExpanded((v) => !v)} hitSlop={8} accessibilityLabel={aboutExpanded ? t('readLess') : t('readMore')}>
                    <Text style={{ color: GOLD, marginTop: spacing(1), fontFamily: fonts.semibold }}>{aboutExpanded ? t("readLess") : t("readMore")}</Text>
                  </KPressable>
                ) : null}
              </NovaCard>
            </>
          ) : null}

          {/* Activité de ce jeton */}
          {activity !== null ? (
            <>
              <SectionLabel>{t('tokenActivityTitle')}</SectionLabel>
              <NovaCard padded={activityError || activity.length === 0}>
                {activityError ? <Text style={typography.muted}>{t("activityUnavailable")}</Text> : activity.length === 0 ? <Text style={typography.muted}>{t("noTxFound")}</Text> : (
                  activity.map((tx, i) => <TxRow key={tx.hash} tx={tx} symbol={detail?.symbol ?? id ?? ''} decimals={tx.decimals ?? decimals ?? chain?.nativeDecimals ?? 18} logoUri={tokenLogo} price={detail?.price} fiatSymbol={fiatSym} divider={i > 0} explorerUrl={chain?.explorerUrl} />)
                )}
              </NovaCard>
            </>
          ) : null}
        </>
      )}

      {/* Modale : créer une alerte de prix */}
      <SafeModal visible={alertOpen} transparent animationType="slide" onRequestClose={() => setAlertOpen(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        {/* Fond : cible de fermeture. Ni rebond ni vibration — ce n'est pas un
            bouton, et une feuille qui tremble quand on la ferme fait cheap. */}
        <KPressable
          noScale
          haptic="none"
          accessibilityLabel={t('cancel')}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}
          onPress={() => setAlertOpen(false)}
        >
          {/* Absorbe les taps pour qu'ils ne ferment pas la feuille. */}
          <KPressable noScale haptic="none" style={{ backgroundColor: colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: spacing(2.5), gap: spacing(1.75) }}>
            <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
            <Text style={typography.section}>{t('priceAlertTitle')}{(detail?.symbol || id || '').toUpperCase()}</Text>

            <View style={{ flexDirection: 'row', gap: spacing(1) }}>
              {(['above', 'below'] as const).map((d) => {
                const on = alertDir === d;
                return (
                  <KPressable
                    key={d}
                    onPress={() => setAlertDir(d)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={d === 'above' ? t('alertAbove') : t('alertBelow')}
                    style={{ flex: 1, paddingVertical: spacing(1.25), borderRadius: 12, alignItems: 'center', backgroundColor: on ? colors.primary : colors.surface1, borderWidth: 1, borderColor: on ? colors.primary : colors.border }}
                  >
                    <Text style={{ color: on ? colors.onPrimary : colors.text, fontFamily: fonts.semibold }}>{d === 'above' ? t("alertAbove") : t("alertBelow")}</Text>
                  </KPressable>
                );
              })}
            </View>

            <View style={{ backgroundColor: colors.surface2, borderRadius: 14, paddingHorizontal: spacing(1.5), flexDirection: 'row', alignItems: 'center', gap: spacing(1) }}>
              <TextInput value={alertTarget} onChangeText={setAlertTarget} keyboardType="decimal-pad" placeholder={t("targetPricePlaceholder")} placeholderTextColor={colors.textSecondary} style={{ flex: 1, color: colors.text, fontSize: 20, paddingVertical: spacing(1.5) }} />
              <Text style={{ color: colors.textSecondary, fontFamily: fonts.semibold }}>{fiatSymbol(fiat)}</Text>
            </View>

            <Button label={t('actionCreateAlert')} onPress={createAlert} />
            <Text style={[typography.muted, { textAlign: 'center' }]}>{t("alertFooterText")}</Text>
          </KPressable>
        </KPressable>
        </KeyboardAvoidingView>
      </SafeModal>
    </PremiumScreen>
    </>
  );
}
