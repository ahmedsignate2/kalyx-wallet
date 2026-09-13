import { ScreenHeader } from '../../ui/kit';
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Image, Pressable, useWindowDimensions, Modal, TextInput, KeyboardAvoidingView } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import {
  PremiumScreen,
  GlassCard,
  SegmentedTabs,
  CircleAction,
} from '../../ui/premium';
import { Halo } from '../../ui/kit/Halo';
import { TxRow } from '../../ui/TxRow';
import { InteractiveChart } from '../../ui/InteractiveChart';
import { Icon } from '../../ui/icon';
import { fonts, spacing, useTheme } from '../../ui/theme';
import { useSettings, useT, fiatSymbol } from '../../lib/settingsStore';
import { toast } from '../../lib/toast';
import { useWallet } from '../../lib/walletStore';
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

  const { width } = useWindowDimensions();
  const chartWidth = width - spacing(2.5) * 2 - spacing(2.25) * 2;

  // Chaîne Kalyx correspondante (si le token est une de nos chaînes natives).
  // Un ID CoinGecko peut représenter plusieurs natifs (ETH sur L2) ; le
  // réseau de la position est donc prioritaire. Bitcoin ne doit jamais tomber
  // sur Bitlayer/Merlin simplement parce qu'ils partagent l'ID « bitcoin ».
  const holding = portfolio.holdings.find((h) =>
    h.id === id || h.coingeckoId === id || h.contract?.toLowerCase() === id?.toLowerCase(),
  );
  const chain = (chainParam ? ALL_CHAINS.find((c) => c.id === chainParam) : undefined)
    ?? (holding ? ALL_CHAINS.find((c) => c.id === holding.chainId) : undefined)
    ?? (id === 'bitcoin' ? ALL_CHAINS.find((c) => c.id === 'bitcoin') : undefined)
    ?? ALL_CHAINS.find((c) => c.coingeckoId === id && c.family !== 'evm');

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
    const acct = { evmAddress: stored.evmAddress, solAddress: stored.solAddress, btcAddress: stored.btcAddress };
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
    const address = chain.family === 'bitcoin' ? stored?.btcAddress
      : chain.family === 'solana' ? stored?.solAddress
        : stored?.evmAddress;
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
    if (held?.contract && chain.evmChainId) {
      assessToken(chain.evmChainId, held.contract).then((r) => alive && setRisk(r)).catch(() => {});
    } else {
      setRisk(null);
    }
    return () => { alive = false; };
  }, [chain?.id, accounts, activeAccountIndex, detail?.symbol, holding?.contract, holding?.kind, holding?.symbol]);

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
      if (route === '/send') router.push({ pathname: '/send', params: { chain: chain.id } });
      else router.push(route);
    } else {
      toast.info(t('soon'), t("soonToast"));
    }
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <PremiumScreen>
      <Halo
        size={280}
        mood={detail ? (up ? 'up' : 'down') : 'flat'}
        style={{ position: 'absolute', top: -70, right: -90, opacity: 0.7 }}
      />
      <ScreenHeader title={displayTitle} />

      {failed ? (
        <GlassCard>
          <Text style={typography.bodyStrong}>{t("failedLoadTokenTitle")}</Text>
          <Text style={typography.muted}>{t("failedLoadTokenDesc")}</Text>
          <Text onPress={loadDetail} style={{ color: colors.accent, fontFamily: fonts.bold, marginTop: spacing(1) }}>{t("actionRetry")}</Text>
        </GlassCard>
      ) : (
        <>
          {/* En-tête token + épingler en favori */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
            {(networkLogo || detail?.image) ? (
              <Image source={{ uri: networkLogo || detail?.image }} style={{ width: 48, height: 48, borderRadius: 24 }} />
            ) : (
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.glassStrong }} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={typography.section}>{displayTitle}</Text>
              <Text style={typography.muted}>{displaySymbol}</Text>
            </View>
            <Pressable onPress={openAlert} hitSlop={10} style={{ marginRight: spacing(1.5) }}>
              <Icon name="bell" size={23} color={colors.textMuted} />
            </Pressable>
            <Pressable onPress={() => id && toggleFavorite(id)} hitSlop={10}>
              <Icon name={isFav ? 'starFilled' : 'star'} size={24} color={isFav ? colors.warning : colors.textMuted} />
            </Pressable>
          </View>

          {/* Prix + variation + market cap */}
          <View>
            <Text style={typography.hero} numberOfLines={1} adjustsFontSizeToFit>
              {loadingDetail && !scrub ? '…' : `${money(shownPrice, shownPrice >= 100 ? 0 : 2)} ${fiatSymbol(fiat)}`}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), marginTop: 4 }}>
              {scrub ? (
                <>
                  {scrubChange != null ? (
                    <Text style={{ color: scrubChange >= 0 ? colors.up : colors.down, fontFamily: fonts.bold }}>
                      {scrubChange >= 0 ? '▲' : '▼'} {Math.abs(scrubChange).toFixed(2)}%
                    </Text>
                  ) : null}
                  <Text style={typography.muted}>{formatScrubDate(scrub.t, period)}</Text>
                </>
              ) : (
                <>
                  {detail ? (
                    <Text style={{ color: detail.change24h >= 0 ? colors.up : colors.down, fontFamily: fonts.bold }}>
                      {detail.change24h >= 0 ? '▲' : '▼'} {Math.abs(detail.change24h).toFixed(2)}% (24h)
                    </Text>
                  ) : null}
                  {detail && detail.marketCap > 0 ? (
                    <Text style={typography.muted}>Cap. {compact(detail.marketCap)} {fiatSymbol(fiat)}</Text>
                  ) : null}
                </>
              )}
            </View>
          </View>

          {/* Graphique */}
          <GlassCard>
            <View style={{ height: 190, justifyContent: 'center' }}>
              {loadingChart && chart.length === 0 ? (
                <Text style={[typography.muted, { textAlign: 'center' }]}>{t("loadingChart")}</Text>
              ) : chart.length < 2 ? (
                <Text style={[typography.muted, { textAlign: 'center' }]}>{t("noChartData")}</Text>
              ) : (
                <InteractiveChart points={chart} color={chartColor} width={chartWidth} onScrub={setScrub} />
              )}
            </View>
            <View style={{ marginTop: spacing(1) }}>
              <SegmentedTabs
                items={CHART_PERIODS.map((p) => {
                  const chartPeriodLabels: Record<string, string> = {
                    '24h': t('chartPeriod24h'),
                    '7j': t('chartPeriod7d'),
                    '30j': t('chartPeriod30d'),
                    '1an': t('chartPeriod1y'),
                    'all': t('periodAll'),
                  };
                  return { key: p.key, label: chartPeriodLabels[p.key] || p.label };
                })}
                active={period}
                onChange={(k) => setPeriod(k as ChartPeriod)}
              />
            </View>
          </GlassCard>

          {/* Solde personnel, regroupé par réseau. */}
          {owned.length > 0 ? (
            <GlassCard>
              <Text style={typography.bodyStrong}>{t("yourBalance")}</Text>
              <Text style={[typography.hero, { marginTop: spacing(0.5) }]}>{money(ownedTotal, 2)} {fiatSymbol(fiat)}</Text>
              {owned.map((holding: Holding) => (
                <View key={holding.id} style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing(1) }}>
                  <Text style={typography.muted}>{formatTokenAmount(holding.raw, holding.decimals)} {holding.symbol} · {ALL_CHAINS.find((c) => c.id === holding.chainId)?.name ?? holding.chainId}</Text>
                  <Text style={typography.body}>{money(holding.fiat, 2)} {fiatSymbol(fiat)}</Text>
                </View>
              ))}
            </GlassCard>
          ) : null}

          {/* Actions principales : envoyer, recevoir, swap. */}
          <View style={{ flexDirection: 'row', gap: spacing(2), paddingHorizontal: spacing(1) }}>
            <CircleAction icon="send" label={t('send')} disabled={chain?.family === 'bitcoin'} onPress={() => goSendReceive('/send')} />
            <CircleAction icon="receive" label={t('receive')} onPress={() => goSendReceive('/receive')} />
            <CircleAction icon="convert" label="Swap" onPress={() => toast.info(t('soon'))} />
          </View>
          {/* Description */}
          {activity !== null ? (
            <View>
              <Text style={typography.section}>{t("tokenActivityTitle")}</Text>
              {activityError ? <Text style={typography.muted}>{t("activityUnavailable")}</Text> : activity.length === 0 ? <Text style={typography.muted}>{t("noTxFound")}</Text> : (
                <View>
                  {activity.map((tx, i) => <TxRow key={tx.hash} tx={tx} symbol={detail?.symbol ?? id ?? ''} decimals={tx.decimals ?? chain?.nativeDecimals ?? 18} logoUri={networkLogo || detail?.image} price={detail?.price} fiatSymbol={fiatSymbol(fiat)} divider={i > 0} explorerUrl={chain?.explorerUrl} />)}
                </View>
              )}
            </View>
          ) : null}

          <View>
            <Text style={typography.section}>{t("tokenDetailsTitle")}</Text>
            <Text style={typography.muted}>{t('networkLabel').replace(/\$\{.*?\}/, chain?.name ?? 'Marché multi-réseaux')}</Text>
            <Text style={typography.muted}>{t('decimalsLabel').replace(/\$\{.*?\}/, String(chain?.nativeDecimals ?? '—'))}</Text>
            {chain?.explorerUrl ? <Text style={{ color: colors.accent, marginTop: 4 }}>{t('explorerLabel').replace(/\$\{.*?\}/, chain.explorerUrl)}</Text> : null}
          </View>

          {detail ? (
            <View>
              <Text style={typography.section}>{t("marketDetailsTitle")}</Text>
              <Text style={typography.muted}>{t('marketCapLabel')}{compact(detail.marketCap)} {fiatSymbol(fiat)}</Text>
              <Text style={typography.muted}>{t('volume24hLabel')}{compact(detail.volume24h)} {fiatSymbol(fiat)}</Text>
              <Text style={typography.muted}>ATH : {money(detail.ath)} {fiatSymbol(fiat)} · ATL : {money(detail.atl)} {fiatSymbol(fiat)}</Text>
              {detail.circulatingSupply > 0 ? <Text style={typography.muted}>{t('circulatingSupplyLabel')}{detail.circulatingSupply.toLocaleString()}</Text> : null}
            </View>
          ) : null}

          <View>
            <Text style={typography.section}>{t("securityTitle")}</Text>
            <Text style={typography.muted}>{risk ? `${risk.level === 'danger' ? t("securityRisk") : t("securitySafe")} · analyse GoPlus` : t("securityUnavailable")}</Text>
          </View>

          {detail?.description ? (
            <GlassCard>
              <Text style={typography.bodyStrong}>À propos de {detail.name}</Text>
              <Text numberOfLines={aboutExpanded ? undefined : 5} style={[typography.muted, { marginTop: spacing(1), lineHeight: 20 }]}>{detail.description}</Text>
              {detail.description.length > 320 ? <Pressable onPress={() => setAboutExpanded((v) => !v)}><Text style={{ color: colors.accent, marginTop: spacing(1), fontFamily: fonts.semibold }}>{aboutExpanded ? t("readLess") : t("readMore")}</Text></Pressable> : null}
            </GlassCard>
          ) : null}
        </>
      )}

      {/* Modale : créer une alerte de prix */}
      <Modal visible={alertOpen} transparent animationType="slide" onRequestClose={() => setAlertOpen(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }} onPress={() => setAlertOpen(false)}>
          <Pressable style={{ backgroundColor: colors.bgDeep, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: spacing(2.5), gap: spacing(1.75) }}>
            <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.glassBorder }} />
            <Text style={typography.section}>Alerte de prix · {(detail?.symbol || id || '').toUpperCase()}</Text>

            <View style={{ flexDirection: 'row', gap: spacing(1) }}>
              {(['above', 'below'] as const).map((d) => {
                const on = alertDir === d;
                return (
                  <Pressable key={d} onPress={() => setAlertDir(d)} style={{ flex: 1, paddingVertical: spacing(1.25), borderRadius: 12, alignItems: 'center', backgroundColor: on ? colors.accent : colors.glass, borderWidth: 1, borderColor: on ? colors.accent : colors.glassBorder }}>
                    <Text style={{ color: on ? colors.onPrimary : colors.text, fontFamily: fonts.semibold }}>{d === 'above' ? t("alertAbove") : t("alertBelow")}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ backgroundColor: colors.bgElevated, borderRadius: 14, paddingHorizontal: spacing(1.5), flexDirection: 'row', alignItems: 'center', gap: spacing(1) }}>
              <TextInput value={alertTarget} onChangeText={setAlertTarget} keyboardType="decimal-pad" placeholder={t("targetPricePlaceholder")} placeholderTextColor={colors.textMuted} style={{ flex: 1, color: colors.text, fontSize: 20, paddingVertical: spacing(1.5) }} />
              <Text style={{ color: colors.textMuted, fontFamily: fonts.semibold }}>{fiatSymbol(fiat)}</Text>
            </View>

            <Pressable onPress={createAlert} style={{ backgroundColor: colors.accent, borderRadius: 14, paddingVertical: spacing(1.5), alignItems: 'center' }}>
              <Text style={{ color: colors.onPrimary, fontFamily: fonts.bold, fontSize: 16 }}>{t("actionCreateAlert")}</Text>
            </Pressable>
            <Text style={[typography.muted, { textAlign: 'center' }]}>{t("alertFooterText")}</Text>
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </PremiumScreen>
    </>
  );
}
