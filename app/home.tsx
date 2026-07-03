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
import { useSettings, useT, fiatSymbol } from '../lib/settingsStore';
import {
  getAdapter,
  formatBalance,
  formatAmount,
  isWalletError,
  getPrices,
  getMarkets,
  sortMarkets,
  type MarketCoin,
} from '../src';

const HERO_SPARK = [3, 4, 3.5, 5, 4.6, 6, 5.4, 7, 6.6, 8.2, 7.8, 9.4];

function greetingKey() {
  const h = new Date().getHours();
  return h < 6 ? 'greeting_night' : h < 12 ? 'greeting_morning' : h < 18 ? 'greeting_afternoon' : 'greeting_evening';
}
function shorten(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
/** Formatage montant à la française : espaces milliers, 2 décimales. */
function money(value: number, decimals = 2): string {
  const s = value.toFixed(decimals);
  const [int, dec] = s.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return dec ? `${grouped},${dec}` : grouped;
}

export default function Home() {
  const t = useT();
  const account = useWallet((s) => s.account);
  const activeChain = useWallet((s) => s.activeChain);
  const accounts = useWallet((s) => s.accounts);
  const activeAccountIndex = useWallet((s) => s.activeAccountIndex);
  const setActiveAccount = useWallet((s) => s.setActiveAccount);
  const { profileName, fiat } = useSettings();
  const chain = getAdapter(activeChain).config;
  const canSend = chain.family !== 'bitcoin';

  const [raw, setRaw] = useState<bigint | null>(null);
  const [price, setPrice] = useState<{ price: number; change24h: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [markets, setMarkets] = useState<MarketCoin[]>([]);
  const [marketTab, setMarketTab] = useState('favorites');

  const refresh = useCallback(async () => {
    if (!account) return;
    setLoading(true);
    setError(null);
    try {
      const b = await getAdapter(activeChain).getBalance(account.address);
      setRaw(b.raw);
      if (chain.coingeckoId) {
        const p = await getPrices([chain.coingeckoId], fiat);
        setPrice(p[chain.coingeckoId] ?? null);
      } else {
        setPrice(null);
      }
    } catch (e) {
      setError(isWalletError(e) ? e.message : 'Réseau indisponible.');
    } finally {
      setLoading(false);
    }
  }, [account, activeChain, chain.coingeckoId, fiat]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    getMarkets(fiat, 20).then(setMarkets).catch(() => setMarkets([]));
  }, [fiat]);

  if (!account) {
    return (
      <PremiumScreen>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={typography.muted}>…</Text>
      </PremiumScreen>
    );
  }

  const nativeStr = raw != null ? `${formatBalance(raw, chain.nativeDecimals, 6)} ${chain.nativeSymbol}` : '—';
  const hasFiat = !!chain.coingeckoId && !!price && raw != null;
  const fiatValue = hasFiat ? Number(formatAmount(raw!, chain.nativeDecimals)) * price!.price : 0;
  const heroValue = hidden ? '••••••' : loading ? '…' : hasFiat ? `${money(fiatValue)} ${fiatSymbol(fiat)}` : nativeStr;
  const change = price?.change24h ?? null;

  const displayedMarkets =
    marketTab === 'top'
      ? markets.slice(0, 12)
      : marketTab === 'gainers'
        ? sortMarkets(markets, 'gainers').slice(0, 10)
        : marketTab === 'losers'
          ? sortMarkets(markets, 'losers').slice(0, 10)
          : markets.slice(0, 6); // favoris = top 6

  const marketTabs = [
    { key: 'favorites', label: t('favorites') },
    { key: 'top', label: t('top') },
    { key: 'gainers', label: t('gainers') },
    { key: 'losers', label: t('losers') },
  ];

  return (
    <PremiumScreen
      footer={
        <BottomNav
          active="home"
          center={{ icon: '↕', label: t('navExchange'), onPress: () => router.push('/settings') }}
          items={[
            { key: 'home', icon: '🏠', label: t('navHome'), onPress: () => {} },
            { key: 'market', icon: '📊', label: t('navMarket'), onPress: () => Alert.alert(t('soon')) },
            { key: 'wallet', icon: '👛', label: t('navWallet'), onPress: () => router.push('/accounts') },
            { key: 'more', icon: '⚙️', label: t('navMore'), onPress: () => router.push('/settings') },
          ]}
        />
      }
    >
      <Stack.Screen options={{ headerShown: false }} />

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <Text style={typography.muted}>{t(greetingKey())}</Text>
          <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text }}>
            {profileName ? `${profileName} 👋` : '👋'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing(1) }}>
          <IconButton icon="🔍" onPress={() => Alert.alert(t('soon'))} />
          <IconButton icon="🔔" onPress={() => Alert.alert(t('soon'))} badge />
          <IconButton icon="⚙️" onPress={() => router.push('/settings')} />
        </View>
      </View>

      {/* Valeur totale */}
      <GlassCard glow>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Pressable onPress={() => setHidden((h) => !h)}>
            <Text style={typography.muted}>
              {t('totalValue')} {hidden ? '🙈' : '👁'}
            </Text>
          </Pressable>
          <Chip
            label={chain.testnet ? `${chain.name} · ${t('testnet')}` : chain.name}
            tone={chain.testnet ? 'warning' : 'neutral'}
            onPress={() => router.push('/networks')}
          />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing(0.5) }}>
          <View style={{ flex: 1, marginRight: spacing(1) }}>
            <Text style={typography.hero} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
              {heroValue}
            </Text>
          </View>
          <Sparkline data={HERO_SPARK} color={change != null && change < 0 ? colors.down : colors.accent} width={84} height={40} />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1), marginTop: 4 }}>
          {change != null ? (
            <View style={{ backgroundColor: change >= 0 ? 'rgba(61,220,151,0.15)' : 'rgba(255,107,107,0.15)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={{ color: change >= 0 ? colors.up : colors.down, fontWeight: '600', fontSize: 13 }}>
                {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
              </Text>
            </View>
          ) : null}
          <Text style={typography.muted}>{hasFiat ? nativeStr : `${chain.name}`}</Text>
        </View>
        {error ? <Text style={{ color: colors.danger, marginTop: 4 }}>{error}</Text> : null}

        <View style={{ flexDirection: 'row', gap: spacing(1), marginTop: spacing(2) }}>
          <ActionTile icon="＋" label={t('buy')} onPress={() => Alert.alert(t('soon'))} />
          <ActionTile icon="↑" label={t('send')} disabled={!canSend} onPress={() => router.push('/send')} />
          <ActionTile icon="↓" label={t('receive')} onPress={() => router.push('/receive')} />
          <ActionTile icon="⇄" label={t('convert')} onPress={() => Alert.alert(t('soon'))} />
        </View>
      </GlassCard>

      {/* Comptes */}
      <GlassCard>
        <SectionHeader title={t('accounts')} actionLabel={t('viewAll')} onAction={() => router.push('/accounts')} />
        {accounts.map((a, i) => (
          <ListRow
            key={a.index}
            divider={i > 0}
            left={<GradientAvatar label="◈" />}
            title={a.label}
            subtitle={shorten(a.evmAddress)}
            onPress={() => setActiveAccount(a.index)}
            right={
              a.index === activeAccountIndex ? (
                <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '600' }}>{t('active')} ✓</Text>
              ) : (
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>EVM · BTC</Text>
              )
            }
          />
        ))}
        <ListRow divider left={<Avatar label="＋" color={colors.glassStrong} />} title={t('addAccount')} onPress={() => router.push('/accounts')} />
      </GlassCard>

      {/* Marché (réel) */}
      <View style={{ gap: spacing(1.5) }}>
        <SectionHeader title={t('market')} actionLabel={t('viewAll')} onAction={() => Alert.alert(t('soon'))} />
        <SegmentedTabs items={marketTabs} active={marketTab} onChange={setMarketTab} />
        <GlassCard>
          {displayedMarkets.length === 0 ? (
            <Text style={[typography.muted, { textAlign: 'center', paddingVertical: spacing(2) }]}>…</Text>
          ) : (
            displayedMarkets.map((m, i) => (
              <MarketRow
                key={m.id}
                divider={i > 0}
                icon={m.symbol.slice(0, 1)}
                color={colors.glassStrong}
                imageUri={m.image}
                name={m.name}
                symbol={m.symbol}
                price={`${money(m.price, m.price >= 100 ? 0 : 2)} ${fiatSymbol(fiat)}`}
                change={m.change24h}
                spark={m.sparkline}
              />
            ))
          )}
        </GlassCard>
      </View>

      <SectionHeader title={t('activity')} actionLabel={t('viewHistory')} onAction={() => router.push('/history')} />
    </PremiumScreen>
  );
}
