import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Alert } from 'react-native';
import { router, Stack } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import {
  PremiumScreen,
  GlassCard,
  Chip,
  IconButton,
  ActionButton,
  SectionHeader,
  AccountRow,
  MarketRow,
  BottomNav,
} from '../ui/premium';
import { colors, spacing, typography } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { getAdapter, formatBalance, isWalletError } from '../src';

// Placeholder : viendra des réglages plus tard.
const USER_NAME = 'Ahmed';

// Marché : données de démonstration (pas de flux de prix live pour l'instant).
const MARKET = [
  { icon: '₿', name: 'Bitcoin', symbol: 'BTC', price: '58 420 €', change: 2.14 },
  { icon: 'Ξ', name: 'Ethereum', symbol: 'ETH', price: '3 180 €', change: -1.02 },
  { icon: '◎', name: 'Solana', symbol: 'SOL', price: '142 €', change: 4.87 },
];

function greeting() {
  const h = new Date().getHours();
  return h < 6 ? 'Bonne nuit' : h < 18 ? 'Bonjour' : 'Bonsoir';
}
function shorten(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

const soon = () => Alert.alert('Bientôt', 'Cette fonctionnalité arrive dans une prochaine version.');

export default function Home() {
  const account = useWallet((s) => s.account);
  const activeChain = useWallet((s) => s.activeChain);
  const accounts = useWallet((s) => s.accounts);
  const activeAccountIndex = useWallet((s) => s.activeAccountIndex);
  const setActiveAccount = useWallet((s) => s.setActiveAccount);
  const chain = getAdapter(activeChain).config;
  const canSend = chain.family !== 'bitcoin';

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
      setError(isWalletError(e) ? e.message : 'Réseau indisponible.');
    } finally {
      setLoading(false);
    }
  }, [account, activeChain]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!account) {
    return (
      <PremiumScreen>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={typography.muted}>Chargement du compte…</Text>
      </PremiumScreen>
    );
  }

  return (
    <PremiumScreen
      footer={
        <BottomNav
          active="home"
          items={[
            { key: 'home', icon: '🏠', label: 'Accueil', onPress: () => {} },
            { key: 'market', icon: '📊', label: 'Marché', onPress: soon },
            { key: 'accounts', icon: '👛', label: 'Comptes', onPress: () => router.push('/accounts') },
            { key: 'settings', icon: '⚙️', label: 'Réglages', onPress: soon },
          ]}
        />
      }
    >
      <Stack.Screen options={{ headerShown: false }} />
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <Text style={typography.muted}>{greeting()},</Text>
          <Text style={typography.title}>{USER_NAME} 👋</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing(1) }}>
          <IconButton icon="🔍" onPress={soon} />
          <IconButton icon="🎁" onPress={soon} />
          <IconButton icon="🔔" onPress={soon} />
        </View>
      </View>

      {/* Carte Valeur totale */}
      <GlassCard glow>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={typography.muted}>Valeur totale</Text>
          <Chip
            label={chain.testnet ? `${chain.name} · testnet` : chain.name}
            tone={chain.testnet ? 'warning' : 'neutral'}
            onPress={() => router.push('/networks')}
          />
        </View>
        <Text style={[typography.hero, { marginTop: spacing(1) }]}>
          {loading ? '…' : balance != null ? `${balance} ${chain.nativeSymbol}` : '—'}
        </Text>
        <Text style={typography.muted}>≈ valeur en € bientôt disponible</Text>
        {error ? <Text style={{ color: colors.danger, marginTop: 4 }}>{error}</Text> : null}
        <View style={{ flexDirection: 'row', gap: spacing(2), marginTop: spacing(1.5) }}>
          <Text onPress={refresh} style={{ color: colors.accent, fontWeight: '600' }}>
            {loading ? 'Actualisation…' : '↻ Actualiser'}
          </Text>
          <Text
            onPress={async () => {
              await Clipboard.setStringAsync(account.address);
              Alert.alert('Copié', 'Adresse copiée.');
            }}
            style={{ color: colors.textMuted }}
          >
            {shorten(account.address)}
          </Text>
        </View>
      </GlassCard>

      {/* Actions rapides */}
      <View style={{ flexDirection: 'row', gap: spacing(1.5) }}>
        <ActionButton icon="💳" label="Acheter" onPress={soon} />
        <ActionButton
          icon="↑"
          label="Envoyer"
          primary
          disabled={!canSend}
          onPress={() => router.push('/send')}
        />
        <ActionButton icon="↓" label="Recevoir" onPress={() => router.push('/receive')} />
        <ActionButton icon="⇄" label="Convertir" onPress={soon} />
      </View>

      {/* Comptes */}
      <View style={{ gap: spacing(1.25) }}>
        <SectionHeader title="Comptes" actionLabel="Gérer" onAction={() => router.push('/accounts')} />
        {accounts.map((a) => (
          <AccountRow
            key={a.index}
            icon="👤"
            title={a.label}
            subtitle={shorten(a.evmAddress)}
            active={a.index === activeAccountIndex}
            onPress={() => setActiveAccount(a.index)}
            right={
              a.index === activeAccountIndex ? (
                <Text style={{ color: colors.accent, fontSize: 18 }}>✓</Text>
              ) : undefined
            }
          />
        ))}
      </View>

      {/* Marché */}
      <View style={{ gap: spacing(1.25) }}>
        <SectionHeader title="Marché" actionLabel="Tout voir" onAction={soon} />
        {MARKET.map((m) => (
          <MarketRow key={m.symbol} {...m} />
        ))}
        <Text style={[typography.muted, { textAlign: 'center' }]}>Prix indicatifs (démo)</Text>
      </View>

      {/* Historique (accès rapide, réel) */}
      <SectionHeader title="Activité" actionLabel="Historique" onAction={() => router.push('/history')} />
    </PremiumScreen>
  );
}
