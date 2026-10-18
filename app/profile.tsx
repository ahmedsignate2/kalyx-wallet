/**
 * Profil on-chain du compte actif : depuis quand il est actif, combien de
 * transactions, sur quels réseaux — lu à l'instant sur les réseaux, jamais
 * estimé — et les étapes franchies, chacune avec son critère.
 */
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { ScreenHeader, Card, Screen, Skeleton, EmptyState } from '../ui/kit';
import { NovaHero } from '../ui/nova';
import { Icon, type IconName } from '../ui/icon';
import { LogoImage } from '../ui/kit/LogoImage';
import { fonts, radii, spacing, useTheme } from '../ui/theme';
import { useSettings, useT } from '../lib/settingsStore';
import { useWallet } from '../lib/walletStore';
import { loadOnchainProfile } from '../lib/onchainProfile';
import { badgesOf, type BadgeId, type OnchainProfile } from '../src/domain/profile/onchainProfile';
import { chainIconUrl, chainNameOf } from '../src';

const BADGE_ICON: Record<BadgeId, IconName> = { veteran: 'clock', multichain: 'networks', regular: 'history', bitcoiner: 'wallet' };

export default function Profile() {
  const { colors, typography } = useTheme();
  const t = useT();
  const lang = useSettings((s) => s.language);
  const account = useWallet((s) => s.accounts[s.activeAccountIndex]);
  const [profile, setProfile] = useState<OnchainProfile | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const key = account ? `${account.evmAddress}|${account.solAddress ?? ''}|${account.btcAddress ?? ''}` : '';

  const load = useCallback(async () => {
    if (!account) return;
    setFailed(false);
    try {
      setProfile(await loadOnchainProfile(account));
    } catch {
      setFailed(true);
    }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setProfile(null);
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const since = profile?.firstAt ? new Date(profile.firstAt).toLocaleDateString(lang, { month: 'long', year: 'numeric' }) : null;
  const badges = profile ? badgesOf(profile) : [];
  const earned = badges.filter((b) => b.earned).length;
  const stat = (label: string, value: string) => (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={{ ...typography.muted, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: colors.text, fontFamily: fonts.semibold, fontSize: 18, fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}>
        <ScreenHeader />
        <NovaHero icon="profile" title={t('profileTitle')} subtitle={t('profileIntro')} />

        {failed ? (
          <Card><EmptyState icon="warning" title={t('profileTitle')} body={t('profileFailed')} actionLabel={t('retry')} onAction={() => void load()} /></Card>
        ) : !profile ? (
          <Card style={{ gap: spacing(1.5) }}>
            <Skeleton height={44} />
            <Skeleton height={44} />
          </Card>
        ) : (
          <>
            <Card style={{ gap: spacing(2) }}>
              <View style={{ flexDirection: 'row', gap: spacing(2) }}>
                {stat(t('profileSince'), since ?? '—')}
                {stat(t('profileTx'), `${profile.totalTx.toLocaleString(lang)}${profile.atLeast ? '+' : ''}`)}
                {stat(t('profileNetworks'), String(profile.chains.length))}
              </View>
              {profile.chains.length ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1) }}>
                  {profile.chains.map((c) => (
                    <View key={c.chainId} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing(1), paddingVertical: 4, borderRadius: radii.full, backgroundColor: colors.surface2 }}>
                      {chainIconUrl(c.chainId) ? <LogoImage uri={chainIconUrl(c.chainId)!} size={16} /> : null}
                      <Text style={{ color: colors.text, fontFamily: fonts.medium, fontSize: 12 }}>{chainNameOf(c.chainId) ?? c.chainId}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={typography.muted}>{t('profileNoActivity')}</Text>
              )}
            </Card>

            <Text style={{ ...typography.muted, fontFamily: fonts.semibold }}>{t('profileBadges').replace('{earned}', String(earned)).replace('{total}', String(badges.length))}</Text>
            <Card padded={false} style={{ paddingHorizontal: spacing(2) }}>
              {badges.map((b, i) => (
                <View key={b.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), paddingVertical: spacing(1.5), borderTopWidth: i ? 1 : 0, borderTopColor: colors.border, opacity: b.earned ? 1 : 0.55 }}>
                  <View style={{ width: 40, height: 40, borderRadius: radii.full, alignItems: 'center', justifyContent: 'center', backgroundColor: b.earned ? colors.primary : colors.surface2 }}>
                    <Icon name={b.earned ? BADGE_ICON[b.id] : 'lock'} size={18} color={b.earned ? colors.onPrimary : colors.textSecondary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={typography.bodyStrong}>{t(`profileBadge_${b.id}` as never)}</Text>
                    <Text style={typography.muted}>{t(`profileBadge_${b.id}_how` as never)}</Text>
                  </View>
                  {b.earned ? <Icon name="checkmark" size={18} color={colors.primary} /> : null}
                </View>
              ))}
            </Card>

            {profile.failed.length ? (
              <Text style={{ ...typography.muted, fontSize: 12, textAlign: 'center' }}>
                {t('profilePartial').replace('{networks}', profile.failed.map((c) => chainNameOf(c) ?? c).join(', '))}
              </Text>
            ) : null}
            <Text style={{ ...typography.muted, fontSize: 12, textAlign: 'center' }}>{t('profileSource')}</Text>
          </>
        )}
      </Screen>
    </>
  );
}
