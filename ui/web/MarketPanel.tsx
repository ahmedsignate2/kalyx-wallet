/**
 * Onglet Market du dashboard web — réutilise entièrement les fonctions de
 * marché déjà utilisées par l'écran mobile équivalent (app/market.tsx) :
 * getMarkets/sortMarkets/searchCoins/formatFiat (src/domain/prices/
 * coingecko.ts), 100 % fetch, aucune dépendance native. Seule la présentation
 * est propre au web, pour rester visuellement cohérente avec le reste du
 * dashboard (Card/useTheme de ui/theme.ts, pas ui/premium.tsx qui a son
 * propre système de thème séparé).
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Image, TextInput, ScrollView } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { Icon } from '../icon';
import { fonts, radii, spacing, useTheme } from '../theme';
import { useT, useSettings, fiatSymbol } from '../../lib/settingsStore';
import { useWebT } from './webI18n';
import { CrossFade } from './motion';
import { webLocale } from './webTheme';

/** Cours au format de la langue choisie (même convention que le solde au-dessus). */
function fmtPrice(price: number, fiat: string, sym: string): string {
  const digits = price >= 100 ? 0 : price >= 1 ? 2 : 6;
  try {
    return new Intl.NumberFormat(webLocale(), { style: 'currency', currency: fiat.toUpperCase(), maximumFractionDigits: digits, minimumFractionDigits: digits === 6 ? 2 : digits }).format(price);
  } catch {
    return `${sym}${price.toFixed(digits)}`;
  }
}
import { getMarkets, sortMarkets, searchCoins, formatFiat, formatPercent, type MarketCoin, type SearchCoin, type MarketOrder } from '../../src';

/** Icône distante avec repli lettré (même principe que ChainAvatar, mais
 *  générique — les jetons du marché n'ont pas de ChainConfig). */
function CoinAvatar({ uri, label, size = 32 }: { uri?: string; label: string; size?: number }) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  if (!uri || failed) {
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.glassStrong, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: size * 0.4, color: colors.text, fontFamily: fonts.bold }}>{(label || '?').slice(0, 1).toUpperCase()}</Text>
      </View>
    );
  }
  return <Image source={{ uri }} onError={() => setFailed(true)} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.glass }} />;
}

/** Mini-tendance décorative (non interactive) en fond de ligne de marché. */
function MiniSparkline({ values, up, width = 64, height = 28 }: { values: number[]; up: boolean; width?: number; height?: number }) {
  const { colors } = useTheme();
  if (!values || values.length < 2) return <View style={{ width, height }} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * width).toFixed(1)},${(height - ((v - min) / span) * height).toFixed(1)}`).join(' ');
  return (
    <Svg width={width} height={height}>
      <Polyline points={pts} fill="none" stroke={up ? colors.up : colors.down} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function MarketPanel({ wide }: { wide?: boolean } = {}) {
  const t = useT();
  const tw = useWebT();
  const TABS: { key: MarketOrder; label: string }[] = [
    { key: 'top', label: tw('marketTop') },
    { key: 'gainers', label: t('gainers') },
    { key: 'losers', label: t('losers') },
  ];
  const { colors, typography } = useTheme();
  const fiat = useSettings((s) => s.fiat);
  const sym = fiatSymbol(fiat);
  const [coins, setCoins] = useState<MarketCoin[]>([]);
  const [tab, setTab] = useState<MarketOrder>('top');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchCoin[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    getMarkets(fiat, 50).then(setCoins).catch(() => setCoins([]));
  }, [fiat]);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); setSearching(false); return; }
    setSearching(true);
    const id = setTimeout(() => {
      searchCoins(q).then((r) => { setResults(r); setSearching(false); }).catch(() => setSearching(false));
    }, 300);
    return () => clearTimeout(id);
  }, [query]);

  const searchMode = query.trim().length > 0;
  const rows = tab === 'top' ? coins : sortMarkets(coins, tab);

  return (
    <View style={{ gap: spacing(1.5) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1), backgroundColor: colors.text + '08', borderWidth: 1, borderColor: colors.text + '12', borderRadius: radii.pill, paddingHorizontal: spacing(1.25) }}>
        <Icon name="search" size={15} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={tw('marketSearchPlaceholder')}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          style={{ flex: 1, color: colors.text, backgroundColor: 'transparent', fontSize: 14, paddingVertical: spacing(1) }}
        />
      </View>

      {searchMode ? (
        <View style={{ backgroundColor: colors.text + '08', borderWidth: 1, borderColor: colors.text + '12', borderRadius: radii.lg }}>
          {searching && results.length === 0 ? (
            <Text style={[typography.muted, { textAlign: 'center', paddingVertical: spacing(2) }]}>{t('searching')}</Text>
          ) : results.length === 0 ? (
            <Text style={[typography.muted, { textAlign: 'center', paddingVertical: spacing(2) }]}>{tw('noResults')}</Text>
          ) : (
            results.slice(0, 20).map((c, i) => (
              <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.25), padding: spacing(1.25), borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.glassBorder }}>
                <CoinAvatar uri={c.thumb} label={c.symbol} size={32} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={typography.bodyStrong} numberOfLines={1}>{c.name}</Text>
                  <Text style={typography.muted} numberOfLines={1}>{c.symbol?.toUpperCase()}</Text>
                </View>
                {c.rank ? <Text style={typography.muted}>{`#${c.rank}`}</Text> : null}
              </View>
            ))
          )}
        </View>
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: spacing(0.75) }}>
            {TABS.map((tb) => {
              const on = tb.key === tab;
              return (
                <Pressable key={tb.key} onPress={() => setTab(tb.key)} style={{ paddingHorizontal: spacing(1.5), paddingVertical: spacing(0.75), borderRadius: radii.pill, backgroundColor: on ? colors.accent : colors.glass, borderWidth: 1, borderColor: on ? colors.accent : colors.glassBorder }}>
                  <Text style={{ color: on ? colors.onPrimary : colors.textMuted, fontFamily: fonts.semibold, fontSize: 13 }}>{tb.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <CrossFade id={tab} style={{ backgroundColor: colors.text + '08', borderWidth: 1, borderColor: colors.text + '12', borderRadius: radii.lg }}>
            {rows.length === 0 ? (
              <Text style={[typography.muted, { textAlign: 'center', paddingVertical: spacing(3) }]}>{tw('marketLoading')}</Text>
            ) : wide ? (
              /*
               * ORDINATEUR : un vrai tableau. La ligne de téléphone étirée sur
               * 960 px laissait un trou entre le nom et la courbe ; ici chaque
               * colonne a sa place (rang, actif, prix, 24 h, courbe 7 jours).
               */
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(2), paddingHorizontal: spacing(2), paddingVertical: spacing(1.25) }}>
                  <Text style={[typography.muted, { width: 28, fontSize: 12 }]}>#</Text>
                  <Text style={[typography.muted, { flex: 2, fontSize: 12 }]}>{tw('colAsset')}</Text>
                  <Text style={[typography.muted, { flex: 1, fontSize: 12, textAlign: 'right' }]}>{tw('colPrice')}</Text>
                  <Text style={[typography.muted, { flex: 1, fontSize: 12, textAlign: 'right' }]}>{tw('col24h')}</Text>
                  <Text style={[typography.muted, { width: 160, fontSize: 12, textAlign: 'right' }]}>{tw('col7d')}</Text>
                </View>
                {rows.map((m, i) => {
                  const up = m.change24h >= 0;
                  return (
                    <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(2), paddingHorizontal: spacing(2), paddingVertical: spacing(1.25), borderTopWidth: 1, borderTopColor: colors.glassBorder }}>
                      <Text style={[typography.muted, { width: 28, fontVariant: ['tabular-nums'] }]}>{i + 1}</Text>
                      <View style={{ flex: 2, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing(1.25) }}>
                        <CoinAvatar uri={m.image} label={m.symbol} size={32} />
                        <Text style={typography.bodyStrong} numberOfLines={1}>{m.name}</Text>
                        <Text style={typography.muted} numberOfLines={1}>{m.symbol?.toUpperCase()}</Text>
                      </View>
                      <Text style={{ flex: 1, textAlign: 'right', color: colors.text, fontFamily: fonts.semibold, fontVariant: ['tabular-nums'] }} numberOfLines={1}>
                        {fmtPrice(m.price, fiat, sym)}
                      </Text>
                      <View style={{ flex: 1, alignItems: 'flex-end' }}>
                        <Text style={{ color: up ? colors.up : colors.down, fontFamily: fonts.semibold, fontSize: 13, backgroundColor: (up ? colors.up : colors.down) + '1f', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill, overflow: 'hidden' }}>
                          {`${up ? '+' : ''}${formatPercent(m.change24h)}`}
                        </Text>
                      </View>
                      <View style={{ width: 160, alignItems: 'flex-end' }}>
                        <MiniSparkline values={m.sparkline} up={up} width={140} height={32} />
                      </View>
                    </View>
                  );
                })}
              </>
            ) : (
              rows.map((m, i) => {
                const up = m.change24h >= 0;
                return (
                  <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.25), padding: spacing(1.25), borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.glassBorder }}>
                    <CoinAvatar uri={m.image} label={m.symbol} size={34} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={typography.bodyStrong} numberOfLines={1}>{m.name}</Text>
                      <Text style={typography.muted} numberOfLines={1}>{m.symbol?.toUpperCase()}</Text>
                    </View>
                    <MiniSparkline values={m.sparkline} up={up} />
                    <View style={{ alignItems: 'flex-end', minWidth: 74 }}>
                      <Text style={{ color: colors.text, fontFamily: fonts.semibold, fontVariant: ['tabular-nums'] }} numberOfLines={1}>
                        {fmtPrice(m.price, fiat, sym)}
                      </Text>
                      <Text style={{ color: up ? colors.up : colors.down, fontSize: 12, fontFamily: fonts.medium }}>
                        {`${up ? '+' : ''}${formatPercent(m.change24h)}`}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </CrossFade>
          <Text style={[typography.muted, { textAlign: 'center', fontSize: 12 }]}>{tw('marketSource')}</Text>
        </>
      )}
    </View>
  );
}
