/**
 * Écran Historique — Production Grade A+ :
 * - Hydratation INSTANTANÉE depuis le cache local (zéro skeleton si cache dispo)
 * - Fetch réseau en arrière-plan (UI jamais bloquée)
 * - Filtres : Tout / Reçus / Envoyés / Échecs
 * - Recherche par adresse ou hash
 * - Pull-to-refresh
 * - Export CSV
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { NovaRing } from "../ui/NovaRing";
import { View, Text, ScrollView, RefreshControl, Pressable, Share, TextInput } from 'react-native';
import { Screen, Title, Muted } from '../ui/components';
import { GlassCard, SkeletonRow, PressableScale } from '../ui/premium';
import { TxRow } from '../ui/TxRow';
import { Icon } from '../ui/icon';
import { fonts, radii, spacing, useTheme } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { useSettings, fiatSymbol, useT } from '../lib/settingsStore';
import { useHistoryStore } from '../lib/historyStore';
import { toast } from '../lib/toast';
import { getAdapter, getCoinDetail, transactionsToCsv, type TxSummary } from '../src';

type Filter = 'all' | 'in' | 'out' | 'failed';

const MemoTxRow = React.memo(TxRow);

export default function History() {
  const { colors, typography } = useTheme();
  const t = useT();
  const account = useWallet((s) => s.account);
  const activeChain = useWallet((s) => s.activeChain);
  const { fiat } = useSettings();
  const chain = getAdapter(activeChain).config;

  // History store (cache + background fetch).
  const getCached = useHistoryStore((s) => s.getCached);
  const fetchHistory = useHistoryStore((s) => s.fetchHistory);
  const isLoading = useHistoryStore((s) => s.isLoading);

  // Logo + prix actuel du natif (contre-valeur des lignes).
  const [coin, setCoin] = useState<{ image: string; price: number } | null>(null);
  // Hash de la tx dépliée (détail adresses + explorateur).
  const [openHash, setOpenHash] = useState<string | null>(null);
  // Filtre actif.
  const [filter, setFilter] = useState<Filter>('all');
  // Recherche.
  const [search, setSearch] = useState('');

  // Cached data (instant).
  const cached = account ? getCached(activeChain, account.address) : [];
  const loading = account ? isLoading(activeChain, account.address) : false;
  // « Premier chargement » = cache vide ET en cours de chargement.
  const isFirstLoad = cached.length === 0 && loading;

  // Lancement du fetch réseau en arrière-plan avec fallback local pour le spinner
  const [localRefreshing, setLocalRefreshing] = useState(false);
  const load = useCallback(async () => {
    if (!account) return;
    setLocalRefreshing(true);
    try {
      // Sécurité : Timeout de 1.5s max pour le spinner visuel
      await Promise.race([
        fetchHistory(activeChain, account.address),
        new Promise(resolve => setTimeout(resolve, 1500))
      ]);
    } finally {
      setLocalRefreshing(false);
    }
  }, [account, activeChain, fetchHistory]);

  useEffect(() => {
    load();
  }, [load]);

  // Filtrage + recherche (memoized).
  const filteredTxs = useMemo(() => {
    let txs = cached;
    if (filter === 'in') txs = txs.filter((tx) => tx.direction === 'in');
    else if (filter === 'out') txs = txs.filter((tx) => tx.direction === 'out');
    else if (filter === 'failed') txs = txs.filter((tx) => tx.status === 'failed');
    if (search.trim()) {
      const q = search.toLowerCase();
      txs = txs.filter(
        (tx) =>
          tx.hash.toLowerCase().includes(q) ||
          tx.from.toLowerCase().includes(q) ||
          tx.to.toLowerCase().includes(q),
      );
    }
    return txs;
  }, [cached, filter, search]);

  const exportCsv = async () => {
    if (filteredTxs.length === 0) return;
    const csv = transactionsToCsv(filteredTxs, {
      chainName: chain.name,
      nativeSymbol: chain.nativeSymbol,
      nativeDecimals: chain.nativeDecimals,
      explorerUrl: chain.explorerUrl,
    });
    try {
      await Share.share({ message: csv, title: `nova-history-${chain.id}.csv` });
    } catch {
      toast.error(t('exportFailed'), t('tryAgain'));
    }
  };

  useEffect(() => {
    let alive = true;
    setCoin(null);
    if (!chain.coingeckoId) return;
    getCoinDetail(chain.coingeckoId, fiat)
      .then((d) => alive && d && setCoin({ image: d.image, price: d.price }))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [chain.coingeckoId, fiat]);

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: t('filterAll') },
    { key: 'in', label: t('filterReceived') },
    { key: 'out', label: t('filterSent') },
    { key: 'failed', label: t('filterFailed') },
  ];

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Title>{t('historyTitle')} · {chain.name}</Title>
        {cached.length > 0 ? (
          <Pressable onPress={exportCsv} hitSlop={8} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 5, opacity: pressed ? 0.6 : 1 })}>
            <Icon name="share" size={16} color={colors.accent} />
            <Text style={{ color: colors.accent, fontFamily: fonts.semibold, fontSize: 13 }}>CSV</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingTop: spacing(1), paddingBottom: spacing(4) }}
        refreshControl={<RefreshControl refreshing={localRefreshing} onRefresh={load} tintColor={colors.accent} />}
      >
        {/* Barre de filtres intégrée dans le scroll */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing(1), paddingVertical: spacing(1), marginBottom: spacing(1) }}
        >
          {filters.map((f) => {
            const active = f.key === filter;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={{
                  paddingHorizontal: 16,
                  height: 38,
                  justifyContent: 'center',
                  alignItems: 'center',
                  borderRadius: 20,
                  minWidth: 60,
                  backgroundColor: active ? colors.accent : colors.glass,
                  borderWidth: 1,
                  borderColor: active ? colors.accent : colors.glassBorder,
                }}
              >
                <Text style={{ color: active ? '#fff' : colors.text, fontFamily: fonts.semibold, fontSize: 13 }}>
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Barre de recherche intégrée dans le scroll */}
        {cached.length > 5 ? (
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t('searchCrypto')}
            placeholderTextColor={colors.textMuted}
            style={{
              backgroundColor: colors.glass,
              borderRadius: radii.md,
              borderWidth: 1,
              borderColor: colors.glassBorder,
              paddingHorizontal: spacing(1.5),
              paddingVertical: spacing(1),
              color: colors.text,
              fontFamily: fonts.medium,
              fontSize: 14,
              marginBottom: spacing(2),
            }}
          />
        ) : null}

        {isFirstLoad ? (
          <GlassCard>{[0, 1, 2, 3].map((i) => <SkeletonRow key={i} divider={i > 0} />)}</GlassCard>
        ) : filteredTxs.length === 0 ? (
          <GlassCard style={{ paddingVertical: spacing(4), alignItems: 'center', gap: spacing(2) }}>
            <View style={{ opacity: 0.3, transform: [{ scale: 0.8 }] }}>
              <NovaRing size={96} color={colors.textFaint} />
            </View>
            <View style={{ alignItems: 'center', gap: 4 }}>
              <Text style={typography.bodyStrong}>Aucune activité</Text>
              <Text style={[typography.muted, { textAlign: 'center' }]}>
                {chain.family === 'evm' ? 'Votre historique apparaîtra ici après votre première transaction.' : 'Effectuez un swap ou un transfert pour voir votre activité.'}
              </Text>
            </View>
          </GlassCard>
        ) : (
          <GlassCard>
            {filteredTxs.map((tx, i) => (
              <MemoTxRow
                key={tx.hash}
                tx={tx}
                divider={i > 0}
                symbol={chain.nativeSymbol}
                decimals={chain.nativeDecimals}
                logoUri={coin?.image}
                price={coin?.price}
                fiatSymbol={fiatSymbol(fiat)}
                expanded={openHash === tx.hash}
                explorerUrl={chain.explorerUrl}
                onPress={() => setOpenHash((h) => (h === tx.hash ? null : tx.hash))}
              />
            ))}
          </GlassCard>
        )}
        <View style={{ height: spacing(3) }} />
      </ScrollView>
    </Screen>
  );
}
