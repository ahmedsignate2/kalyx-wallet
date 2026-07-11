import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Pressable, Share } from 'react-native';
import { Screen, Title, Muted } from '../ui/components';
import { GlassCard, SkeletonRow } from '../ui/premium';
import { TxRow } from '../ui/TxRow';
import { Icon } from '../ui/icon';
import { fonts, spacing, useTheme } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { useSettings, fiatSymbol, useT } from '../lib/settingsStore';
import { toast } from '../lib/toast';
import { getAdapter, getCoinDetail, transactionsToCsv, type TxSummary } from '../src';

export default function History() {
  const { colors, typography } = useTheme();
  const t = useT();
  const account = useWallet((s) => s.account);
  const activeChain = useWallet((s) => s.activeChain);
  const { fiat } = useSettings();
  const chain = getAdapter(activeChain).config;

  const [txs, setTxs] = useState<TxSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  // Logo + prix actuel du natif (contre-valeur des lignes).
  const [coin, setCoin] = useState<{ image: string; price: number } | null>(null);
  // Hash de la tx dépliée (détail adresses + explorateur).
  const [openHash, setOpenHash] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!account) return;
    setLoading(true);
    try {
      setTxs(await getAdapter(activeChain).getHistory(account.address));
    } finally {
      setLoading(false);
    }
  }, [account, activeChain]);

  useEffect(() => {
    load();
  }, [load]);

  const exportCsv = async () => {
    if (!txs || txs.length === 0) return;
    const csv = transactionsToCsv(txs, {
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

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Title>{t('historyTitle')} · {chain.name}</Title>
        {txs && txs.length > 0 ? (
          <Pressable onPress={exportCsv} hitSlop={8} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 5, opacity: pressed ? 0.6 : 1 })}>
            <Icon name="share" size={16} color={colors.accent} />
            <Text style={{ color: colors.accent, fontFamily: fonts.semibold, fontSize: 13 }}>CSV</Text>
          </Pressable>
        ) : null}
      </View>
      <ScrollView
        contentContainerStyle={{ paddingTop: spacing(1) }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.accent} />}
      >
        {txs == null ? (
          <GlassCard>{[0, 1, 2, 3].map((i) => <SkeletonRow key={i} divider={i > 0} />)}</GlassCard>
        ) : txs.length === 0 ? (
          <GlassCard>
            <View style={{ alignItems: 'center', paddingVertical: spacing(3), gap: spacing(1) }}>
              <Icon name="history" size={32} color={colors.textMuted} />
              <Text style={typography.bodyStrong}>{t('noTransactions')}</Text>
              <Muted>{t('noTxHint')}</Muted>
            </View>
          </GlassCard>
        ) : (
          <GlassCard>
            {txs.map((tx, i) => (
              <TxRow
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
