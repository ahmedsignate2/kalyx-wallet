import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { Screen, Title, Muted } from '../ui/components';
import { GlassCard, SkeletonRow } from '../ui/premium';
import { TxRow } from '../ui/TxRow';
import { Icon } from '../ui/icon';
import { spacing, useTheme } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { useSettings, fiatSymbol } from '../lib/settingsStore';
import { getAdapter, getCoinDetail, type TxSummary } from '../src';

export default function History() {
  const { colors, typography } = useTheme();
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
      <Title>Historique · {chain.name}</Title>
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
              <Text style={typography.bodyStrong}>Aucune transaction</Text>
              <Muted>Sur ce réseau, pour ce compte. Nécessite une clé Etherscan pour l’EVM.</Muted>
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
