import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Alert, Image, useWindowDimensions } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import {
  PremiumScreen,
  GlassCard,
  SegmentedTabs,
  CircleAction,
} from '../../ui/premium';
import { InteractiveChart } from '../../ui/InteractiveChart';
import { fonts, spacing, useTheme } from '../../ui/theme';
import { useSettings, useT, fiatSymbol } from '../../lib/settingsStore';
import { useWallet } from '../../lib/walletStore';
import {
  getCoinDetail,
  getMarketChartPoints,
  CHART_PERIODS,
  ALL_CHAINS,
  type CoinDetail,
  type ChartPeriod,
  type ChartPoint,
} from '../../src';

function money(v: number, d = 2) {
  const [i, dec] = v.toFixed(d).split('.');
  const g = i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return dec ? `${g},${dec}` : g;
}
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
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT();
  const { fiat, language } = useSettings();
  const setActiveChain = useWallet((s) => s.setActiveChain);

  const [detail, setDetail] = useState<CoinDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [failed, setFailed] = useState(false);
  const [period, setPeriod] = useState<ChartPeriod>('7j');
  const [chart, setChart] = useState<ChartPoint[]>([]);
  const [loadingChart, setLoadingChart] = useState(true);
  // Point sous le doigt pendant le scrub du graphique (null = pas de scrub).
  const [scrub, setScrub] = useState<ChartPoint | null>(null);

  const { width } = useWindowDimensions();
  const chartWidth = width - spacing(2.5) * 2 - spacing(2.25) * 2;

  // Chaîne Nova correspondante (si le token est une de nos chaînes natives).
  const chain = ALL_CHAINS.find((c) => c.coingeckoId === id);

  const loadDetail = useCallback(async () => {
    if (!id) return;
    setLoadingDetail(true);
    setFailed(false);
    const d = await getCoinDetail(id, fiat, language);
    setDetail(d);
    setFailed(!d);
    setLoadingDetail(false);
  }, [id, fiat, language]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    if (!id) return;
    setLoadingChart(true);
    const days = CHART_PERIODS.find((p) => p.key === period)?.days ?? '7';
    getMarketChartPoints(id, fiat, days)
      .then(setChart)
      .catch(() => setChart([]))
      .finally(() => setLoadingChart(false));
  }, [id, period, fiat]);

  const up = chart.length > 1 ? chart[chart.length - 1].v >= chart[0].v : (detail?.change24h ?? 0) >= 0;
  const chartColor = up ? colors.up : colors.down;
  // Prix affiché : celui sous le doigt pendant le scrub, sinon le prix actuel.
  const shownPrice = scrub ? scrub.v : detail?.price ?? 0;
  // Variation depuis le début de la période jusqu'au point scrubbé.
  const scrubChange = scrub && chart.length > 1 && chart[0].v > 0 ? ((scrub.v - chart[0].v) / chart[0].v) * 100 : null;

  const goSendReceive = (route: '/send' | '/receive') => {
    if (chain) {
      setActiveChain(chain.id);
      router.push(route);
    } else {
      Alert.alert(t('soon'), 'Cet actif n’est pas encore un réseau géré par Nova.');
    }
  };

  return (
    <PremiumScreen>
      <Stack.Screen options={{ headerShown: true, title: detail?.name ?? '' }} />

      {failed ? (
        <GlassCard>
          <Text style={typography.bodyStrong}>Impossible de charger ce token</Text>
          <Text style={typography.muted}>CoinGecko n’a pas répondu. Réessaie.</Text>
          <Text onPress={loadDetail} style={{ color: colors.accent, fontFamily: fonts.bold, marginTop: spacing(1) }}>
            ↻ Réessayer
          </Text>
        </GlassCard>
      ) : (
        <>
          {/* En-tête token */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
            {detail?.image ? (
              <Image source={{ uri: detail.image }} style={{ width: 48, height: 48, borderRadius: 24 }} />
            ) : (
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.glassStrong }} />
            )}
            <View>
              <Text style={typography.section}>{detail?.name ?? (loadingDetail ? '…' : id)}</Text>
              <Text style={typography.muted}>{detail?.symbol ?? ''}</Text>
            </View>
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
                <Text style={[typography.muted, { textAlign: 'center' }]}>Chargement du graphique…</Text>
              ) : chart.length < 2 ? (
                <Text style={[typography.muted, { textAlign: 'center' }]}>Pas de données de graphique.</Text>
              ) : (
                <InteractiveChart points={chart} color={chartColor} width={chartWidth} onScrub={setScrub} />
              )}
            </View>
            <View style={{ marginTop: spacing(1) }}>
              <SegmentedTabs
                items={CHART_PERIODS.map((p) => ({ key: p.key, label: p.label }))}
                active={period}
                onChange={(k) => setPeriod(k as ChartPeriod)}
              />
            </View>
          </GlassCard>

          {/* Actions */}
          <View style={{ flexDirection: 'row', gap: spacing(2), paddingHorizontal: spacing(1) }}>
            <CircleAction icon="buy" label={t('buy')} onPress={() => Alert.alert(t('soon'))} />
            <CircleAction icon="send" label={t('send')} disabled={chain?.family === 'bitcoin'} onPress={() => goSendReceive('/send')} />
            <CircleAction icon="receive" label={t('receive')} onPress={() => goSendReceive('/receive')} />
            <CircleAction icon="convert" label={t('convert')} onPress={() => Alert.alert(t('soon'))} />
          </View>

          {/* Description */}
          {detail?.description ? (
            <GlassCard>
              <Text style={typography.bodyStrong}>À propos de {detail.name}</Text>
              <Text style={[typography.muted, { marginTop: spacing(1), lineHeight: 20 }]}>{detail.description}</Text>
            </GlassCard>
          ) : null}
        </>
      )}
    </PremiumScreen>
  );
}
