/**
 * Écran Earn — staking liquide + prêt (Aave v3), depuis Kalyx.
 *
 * Données : `useEarn` (store partagé) → catalogue vérifié, APY réels, soldes,
 * positions, prix. Actions : `EarnSheet` (devis → confirmation → exécution).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { GlassCard, RemoteIcon, SkeletonRow, PressableScale } from '../ui/premium';
import { AppTabBar } from '../ui/tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollView } from 'react-native';
import { Button } from '../ui/components';
import { CountUp } from '../ui/CountUp';
import { FadeInUp } from '../ui/FadeInUp';
import { Icon } from '../ui/icon';
import { EarnSheet } from '../ui/EarnSheet';
import { SegmentedControl } from '../ui/kit';
import { fonts, radii, spacing, useTheme } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { useSettings, useT, fiatSymbol } from '../lib/settingsStore';
import { useEarn, selectPositions, sumPositions, priceOf, safeNum, type EarnAccount, type EarnPositionView } from '../lib/earn';
import { EARN_CATALOG, getAdapter, chainIconUrl, formatTokenAmount, formatAmount, formatFiat, formatPercent, type EarnProtocol, type EarnAction } from '../src';

type Filter = 'mine' | 'all' | 'staking' | 'lending';

const money = formatFiat;

function ApyBadge({ apy, size = 'md' }: { apy: number | null; size?: 'md' | 'lg' }) {
  const { colors } = useTheme();
  const t = useT();
  if (apy === null) return <Text style={{ color: colors.textFaint, fontFamily: fonts.medium, fontSize: 12 }}>{t('earnApyUnavailable')}</Text>;
  return (
    <View style={{ backgroundColor: 'rgba(74,155,114,0.14)', paddingHorizontal: size === 'lg' ? 12 : 8, paddingVertical: size === 'lg' ? 6 : 3, borderRadius: radii.pill }}>
      <Text style={{ color: colors.up, fontFamily: fonts.bold, fontSize: size === 'lg' ? 16 : 13, fontVariant: ['tabular-nums'] }}>{formatPercent(apy)}</Text>
    </View>
  );
}

function ChainTag({ chainId }: { chainId: string }) {
  const { colors } = useTheme();
  const cfg = getAdapter(chainId).config;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <RemoteIcon uri={chainIconUrl(chainId)} label={cfg.name} size={14} />
      <Text style={{ color: colors.textMuted, fontSize: 13, fontFamily: fonts.regular }}>{cfg.name}</Text>
    </View>
  );
}

export default function EarnScreen() {
  const { colors, typography } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const fiat = useSettings((s) => s.fiat);
  const wallet = useWallet();
  const earn = useEarn();

  const acct = useMemo<EarnAccount | null>(() => {
    const a = wallet.accounts.find((x) => x.index === wallet.activeAccountIndex) ?? wallet.accounts[0];
    return a ? { evmAddress: a.evmAddress, solAddress: a.solAddress } : null;
  }, [wallet.accounts, wallet.activeAccountIndex]);

  useEffect(() => {
    if (acct) earn.refresh(acct, fiat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acct?.evmAddress, acct?.solAddress, fiat]);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    if (!acct) return;
    setRefreshing(true);
    try {
      await earn.refresh(acct, fiat, { force: true });
    } finally {
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acct, fiat]);

  const positions = useMemo(() => selectPositions(earn), [earn.positions, earn.prices, earn.apys]); // eslint-disable-line react-hooks/exhaustive-deps
  const { total: totalFiat, yearly: yearlyFiat } = sumPositions(positions);

  // Protocoles utilisables par ce compte (pas de Solana pour un wallet clé privée).
  const catalog = useMemo(() => EARN_CATALOG.filter((p) => p.chainId !== 'solana' || !!acct?.solAddress), [acct?.solAddress]);
  const eligible = useMemo(() => catalog.filter((p) => (earn.balances.underlying[p.id] ?? 0n) > 0n), [catalog, earn.balances]);

  const [filter, setFilter] = useState<Filter | null>(null);
  const effectiveFilter: Filter = filter ?? (earn.loadedFor && eligible.length > 0 ? 'mine' : 'all');
  const listed = useMemo(() => {
    const base = effectiveFilter === 'mine' ? eligible : effectiveFilter === 'all' ? catalog : catalog.filter((p) => p.kind === effectiveFilter);
    // Tri : APY décroissant, APY inconnu en dernier.
    return [...base].sort((a, b) => (earn.apys[b.id] ?? -1) - (earn.apys[a.id] ?? -1));
  }, [effectiveFilter, eligible, catalog, earn.apys]);

  // Feuille d'action
  const [sheet, setSheet] = useState<{ protocol: EarnProtocol; action: EarnAction } | null>(null);
  const open = (protocol: EarnProtocol, action: EarnAction) => setSheet({ protocol, action });
  const onSuccess = () => {
    if (acct) earn.refreshBalances(acct);
  };

  const initialLoading = earn.loading && !earn.loadedFor;

  const filters: { key: Filter; label: string }[] = [
    { key: 'mine', label: t('earnFilterMine') },
    { key: 'all', label: t('earnFilterAll') },
    { key: 'staking', label: t('earnFilterStaking') },
    { key: 'lending', label: t('earnFilterLending') },
  ];

  return (
    <>
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'flex-start' }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        style={{ flex: 1, width: '100%' }}
        contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: insets.bottom + 120, gap: spacing(2.5) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textSecondary} colors={[colors.textSecondary]} />}
        showsVerticalScrollIndicator={false}
      >
        {/* En-tête */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), minHeight: 48 }}>
          <View style={{ flex: 1 }}>
            <Text style={typography.title}>{t('earnTitle')}</Text>
          </View>
          <Pressable onPress={onRefresh} hitSlop={12} disabled={earn.loading}>
            <Icon name="refresh" size={22} color={earn.loading ? colors.textFaint : colors.textMuted} />
          </Pressable>
        </View>
        <Text style={[typography.muted, { marginTop: -spacing(1.5) }]}>{t('earnSubtitle')}</Text>

        {/* Hero */}
        <GlassCard glow>
          <Text style={typography.muted}>{t('earnTotal')}</Text>
          {initialLoading ? (
            <Text style={typography.hero}>…</Text>
          ) : (
            <CountUp value={totalFiat} format={(v) => `${money(v)} ${fiatSymbol(fiat)}`} style={typography.hero} />
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing(1) }}>
            <Text style={typography.muted}>{t('earnYearly')}</Text>
            <Text style={{ color: colors.up, fontFamily: fonts.bold, fontVariant: ['tabular-nums'] }}>
              {initialLoading ? '…' : `+${money(yearlyFiat)} ${fiatSymbol(fiat)}`}
            </Text>
          </View>
        </GlassCard>

        {/* Mes positions */}
        {initialLoading ? (
          <GlassCard>{[0, 1].map((i) => <SkeletonRow key={i} divider={i > 0} />)}</GlassCard>
        ) : positions.length > 0 ? (
          <View style={{ gap: spacing(1.5) }}>
            <Text style={typography.section}>{t('earnPositions')}</Text>
            {positions.map((pv, i) => (
              <FadeInUp key={pv.protocol.id} delay={i * 50}>
                <PositionCard pv={pv} fiat={fiat} onDeposit={() => open(pv.protocol, 'deposit')} onWithdraw={() => open(pv.protocol, 'withdraw')} />
              </FadeInUp>
            ))}
          </View>
        ) : null}

        {/* Opportunités */}
        <View style={{ gap: spacing(1.5) }}>
          <Text style={typography.section}>{t('earnOpportunities')}</Text>
          <SegmentedControl<Filter>
            items={filters}
            value={effectiveFilter}
            onChange={(val) => setFilter(val)}
          />

          {initialLoading ? (
            <GlassCard>{[0, 1, 2].map((i) => <SkeletonRow key={i} divider={i > 0} />)}</GlassCard>
          ) : listed.length === 0 ? (
            <GlassCard>
              <View style={{ alignItems: 'center', paddingVertical: spacing(2), gap: spacing(1.5) }}>
                <Icon name="staking" size={32} color={colors.textMuted} />
                <Text style={[typography.muted, { textAlign: 'center' }]}>{t('earnNoEligible')}</Text>
                <Button label={t('earnNoEligibleCta')} variant="ghost" onPress={() => setFilter('all')} />
              </View>
            </GlassCard>
          ) : (
            listed.map((p, i) => (
              <FadeInUp key={p.id} delay={Math.min(i, 8) * 45}>
                <OpportunityCard
                  p={p}
                  apy={earn.apys[p.id] ?? null}
                  available={earn.balances.underlying[p.id] ?? 0n}
                  price={priceOf(earn.prices, p.underlying.coingeckoId)}
                  fiat={fiat}
                  onPress={() => open(p, 'deposit')}
                />
              </FadeInUp>
            ))
          )}
        </View>
      </ScrollView>
      <AppTabBar active="earn" />
      </View>

      <EarnSheet visible={!!sheet} protocol={sheet?.protocol ?? null} action={sheet?.action ?? 'deposit'} onClose={() => setSheet(null)} onSuccess={onSuccess} />
    </>
  );
}

function PositionCard({ pv, fiat, onDeposit, onWithdraw }: { pv: EarnPositionView; fiat: string; onDeposit: () => void; onWithdraw: () => void }) {
  const { colors, typography } = useTheme();
  const t = useT();
  const p = pv.protocol;
  const isStaking = p.kind === 'staking';
  const withdrawLabel = isStaking ? (t('earnUnstake') || 'Unstake') : (t('earnWithdraw') || 'Retirer');
  const depositLabel = isStaking ? (t('earnStake') || 'Stake') : (t('earnDeposit') || 'Déposer');

  return (
    <GlassCard>
      {/* Rangée 1 : identité (nom complet, jamais tronqué à 4 lettres) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
        <RemoteIcon uri={p.logo} label={p.name} size={42} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={typography.bodyStrong} numberOfLines={1} ellipsizeMode="tail">{p.name} · {p.receipt.symbol}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <ChainTag chainId={p.chainId} />
            <Text style={{ color: colors.textFaint }}>·</Text>
            <Text style={typography.muted}>{isStaking ? t('earnStakingKind') : t('earnLendingKind')}</Text>
          </View>
        </View>
      </View>

      {/* Rangée 2 : solde et contre-valeur */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: spacing(1.5) }}>
        <Text style={[typography.bodyStrong, { fontVariant: ['tabular-nums'], flexShrink: 1 }]} numberOfLines={1}>
          {formatTokenAmount(pv.balance, p.receipt.decimals)} {p.receipt.symbol}
        </Text>
        <Text style={[typography.muted, { fontVariant: ['tabular-nums'] }]}>{pv.fiat > 0 ? `${money(pv.fiat)} ${fiatSymbol(fiat)}` : '—'}</Text>
      </View>

      <View style={{ height: 1, backgroundColor: colors.glassBorder, marginVertical: spacing(1.5) }} />

      {/* Rangée 3 : infos à gauche (peuvent rétrécir), actions à droite (jamais recouvertes) */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing(1) }}>
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing(1), justifyContent: 'flex-start' }}>
          <ApyBadge apy={pv.apy} />
          {pv.yearlyFiat >= 0.01 ? (
            <Text style={[typography.muted, { fontSize: 13, flexShrink: 1 }]} numberOfLines={1}>
              +{money(pv.yearlyFiat)} {fiatSymbol(fiat)} {t('earnPerYear')}
            </Text>
          ) : pv.yearlyFiat > 0 ? (
            <Text style={[typography.muted, { fontSize: 13, flexShrink: 1 }]} numberOfLines={1}>
              {t('earnUnderCentYear').replace('{sym}', fiatSymbol(fiat))}
            </Text>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <Pressable
            onPress={onWithdraw}
            accessibilityRole="button"
            accessibilityLabel={withdrawLabel}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              minWidth: 78,
              height: 34,
              paddingHorizontal: 12,
              borderRadius: radii.pill,
              backgroundColor: colors.glassStrong,
              borderWidth: 1,
              borderColor: colors.glassBorder,
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <Icon name="send" size={13} color={colors.text} />
            <Text style={{ color: colors.text, fontFamily: fonts.semibold, fontSize: 13 }}>
              {withdrawLabel}
            </Text>
          </Pressable>

          <Pressable
            onPress={onDeposit}
            accessibilityRole="button"
            accessibilityLabel={depositLabel}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              minWidth: 78,
              height: 34,
              paddingHorizontal: 14,
              borderRadius: radii.pill,
              backgroundColor: colors.primary,
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <Icon name="add" size={13} color={colors.onPrimary} />
            <Text style={{ color: colors.onPrimary, fontFamily: fonts.bold, fontSize: 13 }}>
              {depositLabel}
            </Text>
          </Pressable>
        </View>
      </View>
    </GlassCard>
  );
}

function OpportunityCard({ p, apy, available, price, fiat, onPress }: { p: EarnProtocol; apy: number | null; available: bigint; price: number; fiat: string; onPress: () => void }) {
  const { colors, typography } = useTheme();
  const t = useT();
  const availStr = formatTokenAmount(available, p.underlying.decimals);
  const availNum = Number(formatAmount(available, p.underlying.decimals));
  const has = available > 0n;
  return (
    <PressableScale onPress={onPress}>
      <GlassCard>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
          <RemoteIcon uri={p.logo} label={p.name} size={42} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={typography.bodyStrong} numberOfLines={2}>{p.name} · {p.underlying.symbol} → {p.receipt.symbol}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <ChainTag chainId={p.chainId} />
              <Text style={{ color: colors.textFaint }}>·</Text>
              <Text style={typography.muted}>{p.kind === 'staking' ? t('earnStakingKind') : t('earnLendingKind')}</Text>
            </View>
          </View>
          <ApyBadge apy={apy} size="lg" />
        </View>
        <View style={{ height: 1, backgroundColor: colors.glassBorder, marginVertical: spacing(1.5) }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={typography.muted} numberOfLines={1}>
            {t('earnAvailable')} :{' '}
            <Text style={{ color: has ? colors.text : colors.textFaint, fontFamily: fonts.semibold }}>
              {availStr} {p.underlying.symbol}
            </Text>
            {has && price > 0 ? <Text style={{ color: colors.textFaint }}> (≈ {money(availNum * price)} {fiatSymbol(fiat)})</Text> : null}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{ color: colors.accent, fontFamily: fonts.semibold, fontSize: 14 }}>{p.kind === 'staking' ? t('earnStake') : t('earnDeposit')}</Text>
            <Icon name="chevron" size={16} color={colors.accent} />
          </View>
        </View>
      </GlassCard>
    </PressableScale>
  );
}
