import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Linking } from 'react-native';
import { Screen, Title, Muted } from '../ui/components';
import { GlassCard, PressableScale, SkeletonRow } from '../ui/premium';
import { Icon } from '../ui/icon';
import { fonts, colors, radii, spacing, typography } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { getAdapter, formatBalance, type TxSummary } from '../src';

function shortHash(h: string) {
  return `${h.slice(0, 10)}…${h.slice(-6)}`;
}

/** Date relative simple (auj., hier, jj/mm). */
function relDate(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const now = new Date();
  const days = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (days <= 0 && now.getDate() === d.getDate()) return "Aujourd'hui";
  if (days <= 1) return 'Hier';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

export default function History() {
  const account = useWallet((s) => s.account);
  const activeChain = useWallet((s) => s.activeChain);
  const chain = getAdapter(activeChain).config;

  const [txs, setTxs] = useState<TxSummary[] | null>(null);
  const [loading, setLoading] = useState(false);

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

  return (
    <Screen>
      <Title>Historique · {chain.name}</Title>
      <ScrollView
        contentContainerStyle={{ gap: spacing(1.25), paddingTop: spacing(1) }}
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
          txs.map((tx) => {
            const inbound = tx.direction === 'in';
            const failed = tx.status === 'failed';
            const sign = inbound ? '+' : tx.direction === 'out' ? '−' : '';
            const amountColor = failed ? colors.danger : inbound ? colors.up : colors.text;
            const iconColor = inbound ? colors.up : colors.textMuted;
            return (
              <PressableScale
                key={tx.hash}
                onPress={() => chain.explorerUrl && Linking.openURL(`${chain.explorerUrl}/tx/${tx.hash}`)}
              >
                <GlassCard style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
                  <View style={{ width: 42, height: 42, borderRadius: radii.pill, backgroundColor: colors.glassStrong, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={inbound ? 'receive' : 'send'} size={20} color={iconColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={typography.bodyStrong}>
                      {inbound ? 'Reçu' : tx.direction === 'out' ? 'Envoyé' : 'Interne'}
                      {failed ? ' · échoué' : ''}
                    </Text>
                    <Muted>{relDate(tx.timestamp)} · {shortHash(tx.hash)}</Muted>
                  </View>
                  <Text style={{ color: amountColor, fontFamily: fonts.semibold, fontVariant: ['tabular-nums'] }}>
                    {sign}
                    {formatBalance(tx.value, chain.nativeDecimals, 6)} {chain.nativeSymbol}
                  </Text>
                </GlassCard>
              </PressableScale>
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}
