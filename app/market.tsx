import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Image, Pressable, RefreshControl } from 'react-native';
import { Stack, router } from 'expo-router';
import {
  PremiumScreen,
  GlassCard,
  SearchBar,
  SegmentedTabs,
  MarketRow,
  ListRow,
  Avatar,
  SkeletonRow
} from '../ui/premium';
import { AppTabBar } from '../ui/tabs';
import { spacing, useTheme } from '../ui/theme';
import { useSettings, useT, fiatSymbol } from '../lib/settingsStore';
import { getMarkets, sortMarkets, searchCoins, type MarketCoin, type SearchCoin, formatFiat } from '../src';

const money = formatFiat;

export default function Market() {
  const { colors, typography } = useTheme();
  const t = useT();
  const { fiat } = useSettings();
  const [coins, setCoins] = useState<MarketCoin[]>([]);
  const [tab, setTab] = useState('favorites');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchCoin[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    getMarkets(fiat, 50).then(setCoins).catch(() => setCoins([]));
  }, [fiat]);

  // Balayer vers le bas pour rafraîchir le marché.
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setCoins(await getMarkets(fiat, 50));
    } catch {
      /* ignore */
    } finally {
      setRefreshing(false);
    }
  }, [fiat]);

  // Recherche globale (toutes les cryptos) via CoinGecko, avec debounce.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const id = setTimeout(async () => {
      setResults(await searchCoins(q));
      setSearching(false);
    }, 300);
    return () => clearTimeout(id);
  }, [query]);

  const searchMode = query.trim().length > 0;
  const base =
    tab === 'top'
      ? coins
      : tab === 'gainers'
        ? sortMarkets(coins, 'gainers')
        : tab === 'losers'
          ? sortMarkets(coins, 'losers')
          : coins.slice(0, 10);

  const tabs = [
    { key: 'favorites', label: t('favorites') },
    { key: 'top', label: t('top') },
    { key: 'gainers', label: t('gainers') },
    { key: 'losers', label: t('losers') },
  ];

  return (
    <PremiumScreen
      footer={<AppTabBar active="market" />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <Text style={typography.title}>{t('market')}</Text>
      <SearchBar value={query} onChangeText={setQuery} placeholder={t('searchCrypto')} />

      {searchMode ? (
        <GlassCard>
          {searching && results.length === 0 ? (
            <Text style={[typography.muted, { textAlign: 'center', paddingVertical: spacing(2) }]}>Recherche…</Text>
          ) : results.length === 0 ? (
            <Text style={[typography.muted, { textAlign: 'center', paddingVertical: spacing(2) }]}>{t('noResults')}</Text>
          ) : (
            results.map((c, i) => (
              <ListRow
                key={c.id}
                divider={i > 0}
                left={
                  c.thumb ? (
                    <Image source={{ uri: c.thumb }} style={{ width: 36, height: 36, borderRadius: 18 }} />
                  ) : (
                    <Avatar label={c.symbol.slice(0, 1)} color={colors.glassStrong} />
                  )
                }
                title={c.name}
                subtitle={c.symbol}
                right={c.rank ? <Text style={typography.muted}>#{c.rank}</Text> : undefined}
                onPress={() => router.push(`/token/${c.id}`)}
              />
            ))
          )}
        </GlassCard>
      ) : (
        <>
          <SegmentedTabs items={tabs} active={tab} onChange={setTab} />
          <GlassCard>
            {base.length === 0 ? (
              [0, 1, 2, 3, 4].map((i) => <SkeletonRow key={i} divider={i > 0} />)
            ) : (
              base.map((m, i) => (
                <MarketRow
                  key={m.id}
                  divider={i > 0}
                  icon={m.symbol.slice(0, 1)}
                  color="#232A36"
                  imageUri={m.image}
                  name={m.name}
                  symbol={m.symbol}
                  price={`${money(m.price, m.price >= 100 ? 0 : 2)} ${fiatSymbol(fiat)}`}
                  change={m.change24h}
                  spark={m.sparkline}
                  onPress={() => router.push(`/token/${m.id}`)}
                />
              ))
            )}
          </GlassCard>
          <Text style={[typography.muted, { textAlign: 'center' }]}>{t('realTimePrices')}</Text>
        </>
      )}
    </PremiumScreen>
  );
}
