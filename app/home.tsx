import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, RefreshControl, ScrollView, Alert } from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Screen, Card, Button, Muted } from '../ui/components';
import { colors, radii, spacing, typography } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { getAdapter, formatBalance, isWalletError } from '../src';

function shorten(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function Home() {
  const account = useWallet((s) => s.account);
  const activeChain = useWallet((s) => s.activeChain);
  const chain = getAdapter(activeChain).config;

  const [balance, setBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!account) return;
    setLoading(true);
    setError(null);
    setBalance(null);
    try {
      const b = await getAdapter(activeChain).getBalance(account.address);
      setBalance(formatBalance(b.raw, b.decimals, 6));
    } catch (e) {
      setError(isWalletError(e) ? e.message : 'Réseau indisponible. Réessaie.');
    } finally {
      setLoading(false);
    }
  }, [account, activeChain]);

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
        {/* Sélecteur de réseau */}
        <Pressable onPress={() => router.push('/networks')}>
          <View
            style={{
              alignSelf: 'flex-start',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: colors.bgElevated,
              borderRadius: radii.pill,
              paddingVertical: spacing(0.75),
              paddingHorizontal: spacing(1.5),
            }}
          >
            <Text style={{ color: colors.text }}>{chain.name}</Text>
            {chain.testnet ? <Text style={{ color: colors.warning }}>· testnet</Text> : null}
            <Text style={{ color: colors.textMuted }}>▾</Text>
          </View>
        </Pressable>

        <Card>
          <Muted>Solde</Muted>
          <Text style={typography.display}>
            {loading ? '…' : balance != null ? `${balance} ${chain.nativeSymbol}` : '—'}
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
          <Pressable onPress={refresh} disabled={loading} style={{ marginTop: spacing(1) }}>
            <Text style={{ color: colors.accent }}>
              {loading ? 'Actualisation…' : '↻ Rafraîchir le solde'}
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

        <Button label="Historique" variant="ghost" onPress={() => router.push('/history')} />
      </ScrollView>
    </Screen>
  );
}
