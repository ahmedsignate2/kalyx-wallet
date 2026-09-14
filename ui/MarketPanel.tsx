/**
 * Volet « Tendances » de l'accueil : les plus fortes hausses et baisses du jour
 * (2 + 2, CoinGecko), puis « Voir tout le marché » qui ouvre l'écran Marché
 * complet. Le marché n'est plus un onglet : il vit là où il sert (accueil, swap).
 */
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Text, Surface, Divider, TokenIcon, Pressable } from './kit';
import { space } from './tokens';
import { useSettings, useT, fiatSymbol } from '../lib/settingsStore';
import { getMarkets, sortMarkets, formatFiat, type MarketCoin } from '../src';

let cache: { fiat: string; coins: MarketCoin[]; at: number } | null = null;

/** Top 50 du marché, mis en cache 2 min (partagé accueil / sélecteur de jetons). */
export async function loadMarkets(fiat: string): Promise<MarketCoin[]> {
  if (cache && cache.fiat === fiat && Date.now() - cache.at < 120_000) return cache.coins;
  const coins = await getMarkets(fiat, 50);
  cache = { fiat, coins, at: Date.now() };
  return coins;
}

export function MarketPanel() {
  const t = useT();
  const fiat = useSettings((s) => s.fiat);
  const [coins, setCoins] = useState<MarketCoin[]>([]);

  useEffect(() => {
    let alive = true;
    loadMarkets(fiat)
      .then((c) => alive && setCoins(c))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [fiat]);

  if (!coins.length) return null;
  const rows = [...sortMarkets(coins, 'gainers').slice(0, 2), ...sortMarkets(coins, 'losers').slice(0, 2)];

  return (
    <View style={{ gap: space[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text variant="title2">{t('trending')}</Text>
        <Pressable onPress={() => router.push('/market')} hitSlop={8}>
          <Text variant="caption" tone="secondary">{t('seeAllMarket')}</Text>
        </Pressable>
      </View>
      <Surface padded={false}>
        {rows.map((m, i) => (
          <React.Fragment key={m.id}>
            <Pressable noScale onPress={() => router.push(`/token/${m.id}`)}>
              <View style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4] }}>
                <TokenIcon symbol={m.symbol} logo={m.image} seed={m.id} size={32} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="body" numberOfLines={1}>{m.name}</Text>
                  <Text variant="caption" tone="secondary">{m.symbol.toUpperCase()}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text variant="body" tabular>
                    {formatFiat(m.price, m.price >= 100 ? 0 : 2)} {fiatSymbol(fiat)}
                  </Text>
                  <Text variant="caption" tone={m.change24h >= 0 ? 'up' : 'down'} tabular>
                    {m.change24h >= 0 ? '↑ +' : '↓ '}
                    {m.change24h.toFixed(1)} %
                  </Text>
                </View>
              </View>
            </Pressable>
            {i < rows.length - 1 ? <Divider inset={60} /> : null}
          </React.Fragment>
        ))}
      </Surface>
    </View>
  );
}
