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
  const accounts = useWallet((s) => s.accounts);
  const activeAccountIndex = useWallet((s) => s.activeAccountIndex);
  const chain = getAdapter(activeChain).config;
  const canSend = chain.family !== 'bitcoin';
  const activeLabel =
    accounts.find((a) => a.index === activeAccountIndex)?.label ?? 'Compte';

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
        {/* Sélecteurs compte + réseau */}
        <View style={{ flexDirection: 'row', gap: spacing(1), flexWrap: 'wrap' }}>
          <Pressable onPress={() => router.push('/accounts')}>
            <View style={chipStyle}>
              <Text style={{ color: colors.text }}>{activeLabel}</Text>
              <Text style={{ color: colors.textMuted }}>▾</Text>
            </View>
          </Pressable>
          <Pressable onPress={() => router.push('/networks')}>
            <View style={chipStyle}>
              <Text style={{ color: colors.text }}>{chain.name}</Text>
              {chain.testnet ? <Text style={{ color: colors.warning }}>· testnet</Text> : null}
              <Text style={{ color: colors.textMuted }}>▾</Text>
            </View>
          </Pressable>
        </View>

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
            <Button
              label={canSend ? 'Envoyer' : 'Envoi bientôt'}
              disabled={!canSend}
              onPress={() => router.push('/send')}
            />
          </View>
        </View>
        {!canSend ? (
          <Muted>L'envoi de Bitcoin arrive prochainement. Réception disponible.</Muted>
        ) : null}

        <Button label="Historique" variant="ghost" onPress={() => router.push('/history')} />
      </ScrollView>
    </Screen>
  );
}

const chipStyle = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: 6,
  backgroundColor: colors.bgElevated,
  borderRadius: radii.pill,
  paddingVertical: spacing(0.75),
  paddingHorizontal: spacing(1.5),
};
