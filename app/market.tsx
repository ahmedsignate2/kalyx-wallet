import React, { useEffect, useState } from 'react';
import { View, Text, Alert } from 'react-native';
import { Stack, router } from 'expo-router';
import {
  PremiumScreen,
  GlassCard,
  SearchBar,
  SegmentedTabs,
  MarketRow,
} from '../ui/premium';
import { AppTabBar } from '../ui/tabs';
import { spacing, typography } from '../ui/theme';
import { useSettings, useT, fiatSymbol } from '../lib/settingsStore';
import { getMarkets, sortMarkets, type MarketCoin } from '../src';

function money(v: number, d = 2) {
  const [i, dec] = v.toFixed(d).split('.');
  const g = i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return dec ? `${g},${dec}` : g;
}

export default function Market() {
  const t = useT();
  const { fiat } = useSettings();
  const [coins, setCoins] = useState<MarketCoin[]>([]);
  const [tab, setTab] = useState('favorites');
  const [query, setQuery] = useState('');

  useEffect(() => {
    getMarkets(fiat, 50).then(setCoins).catch(() => setCoins([]));
  }, [fiat]);

  const q = query.trim().toLowerCase();
  const base =
    tab === 'top'
      ? coins
      : tab === 'gainers'
        ? sortMarkets(coins, 'gainers')
        : tab === 'losers'
          ? sortMarkets(coins, 'losers')
          : coins.slice(0, 10);
  const list = q
    ? coins.filter((c) => c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q))
    : base;

  const tabs = [
    { key: 'favorites', label: t('favorites') },
    { key: 'top', label: t('top') },
    { key: 'gainers', label: t('gainers') },
    { key: 'losers', label: t('losers') },
  ];

  return (
    <PremiumScreen footer={<AppTabBar active="market" />}>
      <Stack.Screen options={{ headerShown: false }} />
      <Text style={typography.title}>{t('market')}</Text>
      <SearchBar value={query} onChangeText={setQuery} placeholder={t('searchCrypto')} />
      {q ? null : <SegmentedTabs items={tabs} active={tab} onChange={setTab} />}
      <GlassCard>
        {list.length === 0 ? (
          <Text style={[typography.muted, { textAlign: 'center', paddingVertical: spacing(2) }]}>…</Text>
        ) : (
          list.map((m, i) => (
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
      <Text
        style={[typography.muted, { textAlign: 'center' }]}
        onPress={() => Alert.alert(t('soon'), 'Fiche détaillée + résumé IA du projet à venir.')}
      >
        Prix en temps réel · résumé IA bientôt
      </Text>
    </PremiumScreen>
  );
}
