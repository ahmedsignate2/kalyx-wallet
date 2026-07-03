import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Alert, Pressable } from 'react-native';
import { router, Stack } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import {
  PremiumScreen,
  GlassCard,
  Chip,
  IconButton,
  ActionTile,
  SectionHeader,
  GradientAvatar,
  Avatar,
  ListRow,
  Sparkline,
  SegmentedTabs,
  MarketRow,
  BottomNav,
} from '../ui/premium';
import { colors, spacing, typography } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { getAdapter, formatBalance, isWalletError } from '../src';

// Placeholder : viendra des réglages plus tard.
const USER_NAME = 'Ahmed';

// Sparkline décorative de la carte solde (courbe de démonstration).
const HERO_SPARK = [3, 4, 3.5, 5, 4.6, 6, 5.4, 7, 6.6, 8.2, 7.8, 9.4];

// Marché : données de démonstration (pas de flux de prix live pour l'instant).
const MARKET = [
  { icon: '₿', color: '#F7931A', name: 'Bitcoin', symbol: 'BTC', price: '61 321 €', change: 2.35, spark: [4, 5, 4.5, 6, 5.5, 7, 6.5, 8] },
  { icon: 'Ξ', color: '#627EEA', name: 'Ethereum', symbol: 'ETH', price: '3 452 €', change: 1.45, spark: [5, 4.6, 5.2, 5, 5.6, 5.3, 6, 6.4] },
  { icon: '◎', color: '#14F195', name: 'Solana', symbol: 'SOL', price: '142 €', change: 4.21, spark: [3, 3.4, 3.2, 4, 3.8, 4.6, 4.3, 5.2] },
];

const MARKET_TABS = ['Favoris', 'Top', 'Gagnants', 'Perdants'];

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
  const [hidden, setHidden] = useState(false);
  const [marketTab, setMarketTab] = useState('Favoris');

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

  const heroValue = hidden
    ? '••••••'
    : loading
      ? '…'
      : balance != null
        ? `${balance} ${chain.nativeSymbol}`
        : '—';

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
          center={{ icon: '↕', label: 'Échanger', onPress: soon }}
          items={[
            { key: 'home', icon: '🏠', label: 'Accueil', onPress: () => {} },
            { key: 'market', icon: '📊', label: 'Marché', onPress: soon },
            { key: 'wallet', icon: '👛', label: 'Portefeuille', onPress: () => router.push('/accounts') },
            { key: 'more', icon: '⋯', label: 'Plus', onPress: soon },
          ]}
        />
      }
    >
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <Text style={typography.muted}>{greeting()}</Text>
          <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text }}>{USER_NAME} 👋</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing(1) }}>
          <IconButton icon="🔍" onPress={soon} />
          <IconButton icon="🎁" onPress={soon} />
          <IconButton icon="🔔" onPress={soon} badge />
        </View>
      </View>

      {/* Carte Valeur totale */}
      <GlassCard glow>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Pressable onPress={() => setHidden((h) => !h)}>
            <Text style={typography.muted}>Valeur totale {hidden ? '🙈' : '👁'}</Text>
          </Pressable>
          <Chip label="Tout" onPress={soon} />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing(0.5) }}>
          <View style={{ flex: 1, marginRight: spacing(1) }}>
            <Text
              style={typography.hero}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.5}
            >
              {heroValue}
            </Text>
          </View>
          <Sparkline data={HERO_SPARK} color={colors.accent} width={84} height={40} />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1), marginTop: 4 }}>
          <View style={{ backgroundColor: 'rgba(61,220,151,0.15)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text style={{ color: colors.up, fontWeight: '600', fontSize: 13 }}>▲ —%</Text>
          </View>
          <Text style={typography.muted}>Variation bientôt · {chain.name}</Text>
        </View>
        {error ? <Text style={{ color: colors.danger, marginTop: 4 }}>{error}</Text> : null}

        {/* Tuiles d'action */}
        <View style={{ flexDirection: 'row', gap: spacing(1), marginTop: spacing(2) }}>
          <ActionTile icon="＋" label="Acheter" onPress={soon} />
          <ActionTile icon="↑" label="Envoyer" disabled={!canSend} onPress={() => router.push('/send')} />
          <ActionTile icon="↓" label="Recevoir" onPress={() => router.push('/receive')} />
          <ActionTile icon="⇄" label="Convertir" onPress={soon} />
        </View>
      </GlassCard>

      {/* Comptes */}
      <GlassCard>
        <SectionHeader title="Comptes" actionLabel="Tout voir" onAction={() => router.push('/accounts')} />
        {accounts.map((a, i) => (
          <ListRow
            key={a.index}
            divider={i > 0}
            left={<GradientAvatar label="◈" />}
            title={a.label}
            subtitle={shorten(a.evmAddress)}
            onPress={() => setActiveAccount(a.index)}
            right={
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>EVM · BTC</Text>
                {a.index === activeAccountIndex ? (
                  <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '600' }}>Actif ✓</Text>
                ) : null}
              </View>
            }
          />
        ))}
        <ListRow
          divider
          left={<Avatar label="＋" color={colors.glassStrong} />}
          title="Ajouter un compte"
          onPress={() => router.push('/accounts')}
        />
      </GlassCard>

      {/* Marché */}
      <View style={{ gap: spacing(1.5) }}>
        <SectionHeader title="Marché" actionLabel="Voir tout" onAction={soon} />
        <SegmentedTabs tabs={MARKET_TABS} active={marketTab} onChange={(t) => (t === 'Favoris' ? setMarketTab(t) : soon())} />
        <GlassCard>
          {MARKET.map((m, i) => (
            <MarketRow key={m.symbol} divider={i > 0} {...m} />
          ))}
        </GlassCard>
        <Text style={[typography.muted, { textAlign: 'center' }]}>Prix indicatifs (démo) · flux live bientôt</Text>
      </View>

      {/* Accès historique réel */}
      <SectionHeader title="Activité" actionLabel="Voir l'historique" onAction={() => router.push('/history')} />
    </PremiumScreen>
  );
}
