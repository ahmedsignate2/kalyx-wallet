import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, RefreshControl, ScrollView, Alert } from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Screen, Card, Button, Muted } from '../ui/components';
import { colors, spacing, typography } from '../ui/theme';
import { useWallet, DEFAULT_CHAIN } from '../lib/walletStore';
import { getAdapter, formatAmount, SEPOLIA } from '../src';

function shorten(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function Home() {
  const account = useWallet((s) => s.account);
  const [balance, setBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!account) return;
    setLoading(true);
    setError(null);
    try {
      const b = await getAdapter(DEFAULT_CHAIN).getBalance(account.address);
      setBalance(formatAmount(b.raw, b.decimals));
    } catch {
      setError('Réseau indisponible. Réessaie.');
    } finally {
      setLoading(false);
    }
  }, [account]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!account) {
    return (
      <Screen>
        <Muted>Chargement du compte…</Muted>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ gap: spacing(2) }}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.accent} />
        }
      >
        <Card>
          <Muted>Solde ({SEPOLIA.name})</Muted>
          <Text style={typography.display}>
            {balance != null ? `${balance} ${SEPOLIA.nativeSymbol}` : '—'}
          </Text>
          {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
          <Pressable
            onPress={async () => {
              await Clipboard.setStringAsync(account.address);
              Alert.alert('Copié', 'Adresse copiée dans le presse-papier.');
            }}
          >
            <Text style={[typography.muted, { marginTop: spacing(1) }]}>
              {shorten(account.address)} · copier
            </Text>
          </Pressable>
        </Card>

        <View style={{ flexDirection: 'row', gap: spacing(1.5) }}>
          <View style={{ flex: 1 }}>
            <Button label="Recevoir" variant="ghost" onPress={() => router.push('/receive')} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="Envoyer" onPress={() => router.push('/send')} />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
