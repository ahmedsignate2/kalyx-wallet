import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, Alert, RefreshControl } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, Stack } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { haptic } from '../lib/haptics';
import {
  PremiumScreen,
  GlassCard,
  Chip,
  Badge,
  IconButton,
  CircleAction,
  SearchBar,
  SectionHeader,
  GradientAvatar,
  Avatar,
  ListRow,
  Sparkline,
  SegmentedTabs,
  MarketRow,
  Skeleton,
  SkeletonRow,
} from '../ui/premium';
import { AppTabBar } from '../ui/tabs';
import { TxRow } from '../ui/TxRow';
import { CountUp } from '../ui/CountUp';
import { FadeInUp } from '../ui/FadeInUp';
import { Icon } from '../ui/icon';
import { fonts, spacing, useTheme } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { useAiStore } from '../lib/aiStore';
import { useSettings, useT, fiatSymbol } from '../lib/settingsStore';
import { toast } from '../lib/toast';
import { useNotifCenter, unreadCount } from '../lib/notificationCenter';
import { isDeviceCompromised } from '../lib/deviceSecurity';
import {
  getAdapter,
  chainIconUrl,
  formatBalance,
  formatAmount,
  isWalletError,
  getPrices,
  getMarkets,
  sortMarkets,
  getMarketChartPoints,
  type MarketCoin,
  type TxSummary,
} from '../src';

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
  const { colors, typography } = useTheme();
  const t = useT();
  const account = useWallet((s) => s.account);
  const activeChain = useWallet((s) => s.activeChain);
  const accounts = useWallet((s) => s.accounts);
  const activeAccountIndex = useWallet((s) => s.activeAccountIndex);
  const setActiveAccount = useWallet((s) => s.setActiveAccount);
  const { profileName, fiat, favorites } = useSettings();
  const isEnabled = useAiStore(s => s.isEnabled);
  const unreadNotifs = useNotifCenter((s) => unreadCount(s.items));
  const chain = getAdapter(activeChain).config;
  // Envoi supporté sur EVM, Bitcoin et Solana.
  const canSend = chain.family === 'evm' || chain.family === 'bitcoin' || chain.family === 'solana';

  const [raw, setRaw] = useState<bigint | null>(null);
  const [price, setPrice] = useState<{ price: number; change24h: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [markets, setMarkets] = useState<MarketCoin[]>([]);
  // Courbe de prix 24h du natif (la valeur du portefeuille = solde × prix,
  // la forme de la courbe est donc celle du prix). Vide = pas de sparkline.
  const [spark, setSpark] = useState<number[]>([]);
  const [marketTab, setMarketTab] = useState('favorites');
  const [marketQuery, setMarketQuery] = useState('');
  // Dernières transactions du compte (null = chargement).
  const [recent, setRecent] = useState<TxSummary[] | null>(null);

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

  // Balayer vers le bas pour rafraîchir : soldes/prix + marché.
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    haptic.light();
    setRefreshing(true);
    try {
      await Promise.all([
        refresh(),
        getMarkets(fiat, 20).then(setMarkets).catch(() => {}),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [refresh, fiat]);

  // Avertissement unique si l'appareil est rooté/jailbreaké (stockage moins sûr).
  useEffect(() => {
    if (isDeviceCompromised()) {
      toast.warning('Appareil non sécurisé', 'Root/jailbreak détecté — évite d’y garder des sommes importantes.');
    }
  }, []);

  // Après un import de phrase : rappeler de restaurer ses réseaux perso (une
  // sauvegarde Nova .json n'est pas dérivable de la seed). Différé à l'accueil
  // (le presse-papier contenait la seed au moment de l'import).
  const maybePromptRestoreNetworks = useCallback(() => {
    AsyncStorage.getItem('nova.promptRestoreNetworks').then((v) => {
      if (!v) return;
      AsyncStorage.removeItem('nova.promptRestoreNetworks');
      Alert.alert(
        'Des réseaux personnalisés ?',
        'Si tu avais ajouté des réseaux (RPC) et gardé une sauvegarde Nova, restaure-la pour les retrouver. Tes fonds y sont toujours, il suffit de redonner le réseau à Nova.',
        [
          { text: 'Plus tard', style: 'cancel' },
          { text: 'Restaurer', onPress: () => router.push('/developer') },
        ],
      );
    });
  }, []);

  // Avertissement Bêta (une fois), puis enchaîne le rappel de restauration —
  // jamais deux Alert simultanées (télescopage Android).
  useEffect(() => {
    AsyncStorage.getItem('nova.betaSeen').then((seen) => {
      if (seen) {
        maybePromptRestoreNetworks();
        return;
      }
      Alert.alert(
        'Nova est en bêta 🧪',
        'L’application est en cours de test. N’y conserve pas de sommes importantes et privilégie de petits montants ou les réseaux de test. Tes clés restent chez toi.',
        [{ text: 'J’ai compris', onPress: () => { AsyncStorage.setItem('nova.betaSeen', '1'); maybePromptRestoreNetworks(); } }],
      );
    });
  }, [maybePromptRestoreNetworks]);

  // Vraie courbe 24h (remplace l'ancienne sparkline factice).
  useEffect(() => {
    let alive = true;
    if (!chain.coingeckoId) {
      setSpark([]);
      return;
    }
    getMarketChartPoints(chain.coingeckoId, fiat, '1')
      .then((pts) => {
        if (!alive) return;
        // ~40 points suffisent pour une sparkline de 84 px.
        const step = Math.max(1, Math.floor(pts.length / 40));
        setSpark(pts.filter((_, i) => i % step === 0 || i === pts.length - 1).map((p) => p.v));
      })
      .catch(() => alive && setSpark([]));
    return () => {
      alive = false;
    };
  }, [chain.coingeckoId, fiat]);

  // Activité récente (4 dernières tx) — même source que l'écran Historique.
  useEffect(() => {
    let alive = true;
    setRecent(null);
    if (!account) return;
    getAdapter(activeChain)
      .getHistory(account.address)
      .then((txs) => alive && setRecent(txs.slice(0, 4)))
      .catch(() => alive && setRecent([]));
    return () => {
      alive = false;
    };
  }, [account, activeChain]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      {(() => {
  if (!account) {
    return (
      <PremiumScreen>
        
        <Text style={typography.muted}>…</Text>
      </PremiumScreen>
    );
  }

  const nativeStr = raw != null ? `${formatBalance(raw, chain.nativeDecimals, 6)} ${chain.nativeSymbol}` : '—';
  const hasFiat = !!chain.coingeckoId && !!price && raw != null;
  const fiatValue = hasFiat ? Number(formatAmount(raw!, chain.nativeDecimals)) * price!.price : 0;
  const heroValue = hidden ? '••••••' : loading ? '…' : hasFiat ? `${money(fiatValue)} ${fiatSymbol(fiat)}` : nativeStr;
  const change = price?.change24h ?? null;
  // P&L 24h en devise : valeur_actuelle − valeur_il_y_a_24h (solde constant).
  const pnl24h =
    hasFiat && change != null && change > -100 ? fiatValue - fiatValue / (1 + change / 100) : null;

  const q = marketQuery.trim().toLowerCase();
  const pinned = markets.filter((m) => favorites.includes(m.id));
  const baseMarkets =
    marketTab === 'top'
      ? markets.slice(0, 12)
      : marketTab === 'gainers'
        ? sortMarkets(markets, 'gainers').slice(0, 10)
        : marketTab === 'losers'
          ? sortMarkets(markets, 'losers').slice(0, 10)
          : pinned.length > 0
            ? pinned // favoris épinglés (★ sur la fiche token)
            : markets.slice(0, 6); // aucun favori → top 6
  const displayedMarkets = q
    ? markets.filter((m) => m.name.toLowerCase().includes(q) || m.symbol.toLowerCase().includes(q))
    : baseMarkets;

  const marketTabs = [
    { key: 'favorites', label: t('favorites') },
    { key: 'top', label: t('top') },
    { key: 'gainers', label: t('gainers') },
    { key: 'losers', label: t('losers') },
  ];

  return (
    <PremiumScreen
      footer={<AppTabBar active="home" />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />}
    >
      

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <Text style={typography.muted}>{t(greetingKey())}</Text>
          <Text style={{ fontSize: 28, fontFamily: fonts.extrabold, color: colors.text }}>
            {profileName ? `${profileName} 👋` : '👋'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing(1) }}>
          <IconButton icon="scan" onPress={() => router.push('/scan')} />
          <IconButton icon="search" onPress={() => router.push('/market')} />
          {/* Pas de faux badge : il reviendra avec les vraies notifications. */}
          <IconButton icon="bell" badge={unreadNotifs > 0} onPress={() => router.push('/notifications')} />
          <IconButton icon="menu" onPress={() => router.push('/menu')} />
        </View>
      </View>

      {/* Valeur totale */}
      <View style={{ marginTop: 8 }} />
      <GlassCard glow>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Pressable onPress={() => setHidden((h) => !h)} hitSlop={8}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={typography.muted}>{t('totalValue')}</Text>
              <Icon name={hidden ? 'eyeOff' : 'eye'} size={16} color={colors.textMuted} />
            </View>
          </Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(0.75) }}>
            {chain.testnet ? <Badge label="TESTNET" /> : null}
            <Chip label={chain.name} onPress={() => router.push('/networks')} />
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing(0.5) }}>
          <View style={{ flex: 1, marginRight: spacing(1) }}>
            {loading && !hidden ? (
              <Skeleton width="70%" height={38} radius={10} style={{ marginVertical: spacing(0.5) }} />
            ) : hasFiat && !hidden ? (
              /* Solde animé : compte jusqu'à la valeur (signature premium). */
              <CountUp value={fiatValue} format={(v) => `${money(v)} ${fiatSymbol(fiat)}`} style={typography.hero} />
            ) : (
              <Text style={typography.hero} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
                {heroValue}
              </Text>
            )}
          </View>
          {spark.length > 1 ? (
            <Sparkline data={spark} color={change != null && change < 0 ? colors.down : colors.up} width={84} height={40} />
          ) : null}
        </View>




        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1), marginTop: 4 }}>
          {change != null ? (
            <View style={{ backgroundColor: change >= 0 ? 'rgba(61,220,151,0.15)' : 'rgba(255,107,107,0.15)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={{ color: change >= 0 ? colors.up : colors.down, fontFamily: fonts.semibold, fontSize: 13, fontVariant: ['tabular-nums'] }}>
                {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
                {pnl24h != null && !hidden ? `  ${pnl24h >= 0 ? '+' : '−'}${money(Math.abs(pnl24h))} ${fiatSymbol(fiat)}` : ''}
              </Text>
            </View>
          ) : null}
          <Text style={typography.muted}>{hasFiat ? nativeStr : `${chain.name}`}</Text>
        </View>
        {error ? <Text style={{ color: colors.danger, marginTop: 4 }}>{error}</Text> : null}

        <View style={{ flexDirection: 'row', gap: spacing(2), marginTop: spacing(2.5), paddingHorizontal: spacing(1) }}>
          {/* Achat fiat : pas encore de partenaire (MoonPay/Ramp) → grisé, honnête. */}
          <CircleAction icon="buy" label={t('buy')} dimmed onPress={() => toast.info('Achat crypto', 'Bientôt (partenaire régulé en cours).')} />
          <CircleAction icon="send" label={t('send')} disabled={!canSend} onPress={() => router.push('/send')} />
          <CircleAction icon="receive" label={t('receive')} onPress={() => router.push('/receive')} />
          <CircleAction icon="convert" label={t('convert')} onPress={() => router.push('/swap')} />
          <CircleAction icon="staking" label="Earn" onPress={() => router.push('/earn')} />
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
                <Text style={{ color: colors.accent, fontSize: 13, fontFamily: fonts.semibold }}>{t('active')} ✓</Text>
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
        <SectionHeader title={t('market')} actionLabel={t('viewAll')} onAction={() => router.push('/market')} />
        <SearchBar value={marketQuery} onChangeText={setMarketQuery} placeholder={t('searchCryptoPh')} />
        {q ? null : <SegmentedTabs items={marketTabs} active={marketTab} onChange={setMarketTab} />}
        <GlassCard>
          {displayedMarkets.length === 0 ? (
            [0, 1, 2, 3].map((i) => <SkeletonRow key={i} divider={i > 0} />)
          ) : (
            displayedMarkets.map((m, i) => (
              <FadeInUp key={m.id} delay={Math.min(i, 8) * 45}>
                <MarketRow
                  divider={i > 0}
                  icon={m.symbol.slice(0, 1)}
                  color={colors.glassStrong}
                  imageUri={m.image}
                  name={m.name}
                  symbol={m.symbol}
                  price={`${money(m.price, m.price >= 100 ? 0 : 2)} ${fiatSymbol(fiat)}`}
                  change={m.change24h}
                  spark={m.sparkline}
                  onPress={() => router.push(`/token/${m.id}`)}
                />
              </FadeInUp>
            ))
          )}
        </GlassCard>
      </View>

      {/* Activité récente (réelle) */}
      <View style={{ gap: spacing(1.5) }}>
        <SectionHeader title={t('activity')} actionLabel={t('viewHistory')} onAction={() => router.push('/history')} />
        <GlassCard>
          {recent == null ? (
            [0, 1, 2].map((i) => <SkeletonRow key={i} divider={i > 0} />)
          ) : recent.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: spacing(2), gap: spacing(0.75) }}>
              <Icon name="history" size={26} color={colors.textMuted} />
              <Text style={typography.muted}>{t('noRecentActivity').replace('{chain}', chain.name)}</Text>
            </View>
          ) : (
            recent.map((tx, i) => (
              <TxRow
                key={tx.hash}
                tx={tx}
                divider={i > 0}
                symbol={chain.nativeSymbol}
                decimals={chain.nativeDecimals}
                logoUri={chainIconUrl(chain.id)}
                price={price?.price}
                fiatSymbol={fiatSymbol(fiat)}
                onPress={() => router.push('/history')}
              />
            ))
          )}
        </GlassCard>
      </View>
    </PremiumScreen>
  );
      })()}
    </>
  );
}
