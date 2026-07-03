import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Linking, Pressable } from 'react-native';
import { Screen, Card, Title, Muted } from '../ui/components';
import { colors, spacing, typography } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { getAdapter, formatBalance, type TxSummary } from '../src';

function shortHash(h: string) {
  return `${h.slice(0, 10)}…${h.slice(-6)}`;
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
        contentContainerStyle={{ gap: spacing(1.5), paddingTop: spacing(1) }}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.accent} />
        }
      >
        {txs == null ? (
          <Muted>Chargement…</Muted>
        ) : txs.length === 0 ? (
          <Card>
            <Muted>
              Aucune transaction à afficher. L'historique nécessite une clé d'API explorer
              (variable EXPO_PUBLIC_ETHERSCAN_KEY) ; sans elle, il reste vide sans bloquer
              le reste de l'app.
            </Muted>
          </Card>
        ) : (
          txs.map((tx) => {
            const sign = tx.direction === 'in' ? '+' : tx.direction === 'out' ? '−' : '';
            const color =
              tx.status === 'failed'
                ? colors.danger
                : tx.direction === 'in'
                  ? colors.success
                  : colors.text;
            return (
              <Pressable
                key={tx.hash}
                onPress={() =>
                  chain.explorerUrl && Linking.openURL(`${chain.explorerUrl}/tx/${tx.hash}`)
                }
              >
                <Card style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={typography.body}>
                      {tx.direction === 'in' ? 'Reçu' : tx.direction === 'out' ? 'Envoyé' : 'Interne'}
                      {tx.status === 'failed' ? ' (échoué)' : ''}
                    </Text>
                    <Muted>{shortHash(tx.hash)}</Muted>
                  </View>
                  <Text style={{ color, fontVariant: ['tabular-nums'] }}>
                    {sign}
                    {formatBalance(tx.value, chain.nativeDecimals, 6)} {chain.nativeSymbol}
                  </Text>
                </Card>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}
