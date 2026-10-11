import { memo, useCallback, useEffect, useEffectEvent, useMemo, useState } from 'react';
import { Text, Image, RefreshControl } from 'react-native';
import { Stack, router } from 'expo-router';
import {
  PremiumList,
  GlassCard,
  GlassCardCell,
  SearchBar,
  SegmentedTabs,
  MarketRow,
  ListRow,
  Avatar,
  SkeletonRow
} from '../ui/premium';
import { EmptyState, ScreenHeader } from '../ui/kit';
import { spacing, useTheme } from '../ui/theme';
import { useSettings, useT, fiatSymbol } from '../lib/settingsStore';
import { getMarkets, getMarketsByIds, sortMarkets, searchCoins, type MarketCoin, type SearchCoin, formatFiat } from '../src';
import { useShallow } from 'zustand/react/shallow';

const money = formatFiat;

const keyOf = (m: MarketCoin) => m.id;

/*
 * Ligne mémoïsée : un re-render de l'écran (rafraîchissement, favoris, saisie)
 * ne redessine que les lignes dont la cotation a changé. `coin` vient tel quel
 * de la réponse réseau (le tri ne fait que réordonner les mêmes objets) : une
 * comparaison d'identité suffit à savoir si son prix, sa variation ou sa
 * courbe ont bougé.
 */
const CoinRow = memo(
  function CoinRow({ coin, fiat, first, last }: { coin: MarketCoin; fiat: string; first: boolean; last: boolean }) {
    const { colors } = useTheme();
    const open = useCallback(() => router.push(`/token/${coin.id}`), [coin.id]);
    return (
      <GlassCardCell first={first} last={last}>
        <MarketRow
          divider={!first}
          icon={coin.symbol.slice(0, 1)}
          color={colors.surface2}
          imageUri={coin.image}
          name={coin.name}
          symbol={coin.symbol}
          price={`${money(coin.price, coin.price >= 100 ? 0 : 2)} ${fiatSymbol(fiat)}`}
          change={coin.change24h}
          spark={coin.sparkline}
          onPress={open}
        />
      </GlassCardCell>
    );
  },
  (a, b) => a.coin === b.coin && a.fiat === b.fiat && a.first === b.first && a.last === b.last,
);

export default function Market() {
  const { colors, typography } = useTheme();
  const t = useT();
  const { fiat } = useSettings(useShallow((s) => ({ fiat: s.fiat })));
  const favorites = useSettings((s) => s.favorites);
  const [coins, setCoins] = useState<MarketCoin[]>([]);
  // Onglet Favoris par défaut SEULEMENT s'il y en a : sinon on ouvrirait sur un vide.
  const [tab, setTab] = useState(() => (useSettings.getState().favorites.length ? 'favorites' : 'top'));
  /*
   * VRAIS FAVORIS. L'onglet affichait le top 10, quels que soient les favoris
   * choisis (étoile de la fiche token). On lit maintenant ces coins-là, même
   * hors du top 50.
   */
  const [favCoins, setFavCoins] = useState<MarketCoin[] | null>(null);
  const favKey = favorites.join(',');
  const fetchFavorites = useEffectEvent(() => (favorites.length ? getMarketsByIds(fiat, favorites) : null));
  useEffect(() => {
    const req = fetchFavorites();
    if (!req) { setFavCoins([]); return; }
    let alive = true;
    req.then((l) => alive && setFavCoins(l)).catch(() => alive && setFavCoins([]));
    return () => { alive = false; };
  }, [fiat, favKey]);
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
    // Résultats d'une requête PRÉCÉDENTE ignorés : « bit » ne doit pas remplacer « bitcoin » s'il répond plus tard.
    let alive = true;
    const id = setTimeout(async () => {
      const r = await searchCoins(q);
      if (!alive) return;
      setResults(r);
      setSearching(false);
    }, 300);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [query]);

  const searchMode = query.trim().length > 0;
  const base = useMemo(
    () =>
      tab === 'top'
        ? coins
        : tab === 'gainers'
          ? sortMarkets(coins, 'gainers')
          : tab === 'losers'
            ? sortMarkets(coins, 'losers')
            : favCoins ?? [],
    [tab, coins, favCoins],
  );
  const lastIndex = base.length - 1;
  const renderCoin = useCallback(
    ({ item, index }: { item: MarketCoin; index: number }) => (
      <CoinRow coin={item} fiat={fiat} first={index === 0} last={index === lastIndex} />
    ),
    [fiat, lastIndex],
  );
  const favEmpty = tab === 'favorites' && favCoins !== null && favCoins.length === 0;

  const tabs = [
    { key: 'favorites', label: t('favorites') },
    { key: 'top', label: t('top') },
    { key: 'gainers', label: t('gainers') },
    { key: 'losers', label: t('losers') },
  ];

  const showList = !searchMode && !favEmpty && base.length > 0;

  return (
    <PremiumList
      data={showList ? base : []}
      keyExtractor={keyOf}
      renderItem={renderCoin}
      initialNumToRender={10}
      maxToRenderPerBatch={8}
      updateCellsBatchingPeriod={50}
      windowSize={7}
      removeClippedSubviews
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
      header={
        <>
          <Stack.Screen options={{ headerShown: false }} />
          <ScreenHeader title={t('market')} fallback="/home" />
          <SearchBar value={query} onChangeText={setQuery} placeholder={t('searchCrypto')} />
          {searchMode ? (
            <GlassCard>
              {searching && results.length === 0 ? (
                <Text style={[typography.muted, { textAlign: 'center', paddingVertical: spacing(2) }]}>{t('searching')}</Text>
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
                        <Avatar label={c.symbol.slice(0, 1)} color={colors.surface2} />
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
              {favEmpty ? (
                <GlassCard>
                  <EmptyState icon="star" title={t('favorites')} body={t('favoritesEmpty')} />
                </GlassCard>
              ) : base.length === 0 ? (
                <GlassCard>
                  {[0, 1, 2, 3, 4].map((i) => <SkeletonRow key={i} divider={i > 0} />)}
                </GlassCard>
              ) : null}
            </>
          )}
        </>
      }
      listFooter={searchMode ? null : <Text style={[typography.muted, { textAlign: 'center' }]}>{t('realTimePrices')}</Text>}
    />
  );
}
