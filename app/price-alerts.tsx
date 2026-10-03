/**
 * Liste des alertes de prix. Création depuis la fiche d'un token (icône 🔔).
 * Vérifiées quand l'app est ouverte (voir ui/PriceAlertWatcher) ; one-shot.
 */
import { IconDisc, NovaCard, NovaHero, Rise } from '../ui/nova';
import { ScreenHeader, Pressable as KPressable } from '../ui/kit';
import React from 'react';
import { View, Text } from 'react-native';
import { Stack, router } from 'expo-router';
import { PremiumScreen, GlassCard } from '../ui/premium';
import { Icon } from '../ui/icon';
import { fonts, spacing, useTheme } from '../ui/theme';
import { usePriceAlerts } from '../lib/priceAlertsStore';
import { useSettings, fiatSymbol, useT } from '../lib/settingsStore';

export default function PriceAlerts() {
  const { colors, typography } = useTheme();
  const t = useT();
  const alerts = usePriceAlerts((s) => s.alerts);
  const remove = usePriceAlerts((s) => s.remove);
  const fiat = useSettings((s) => s.fiat);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <PremiumScreen>
      <ScreenHeader />
      <NovaHero icon="bell" tone="gold" title={t('priceAlerts')} subtitle={t('priceAlertsIntro')} />

      {alerts.length === 0 ? (
        <NovaCard delay={160} style={{ alignItems: 'center', gap: spacing(1), paddingVertical: spacing(3) }}>
          <Text style={typography.bodyStrong}>{t('noAlerts')}</Text>
          <Text style={[typography.muted, { textAlign: 'center' }]}>{t('createAlertHint')}</Text>
          <KPressable onPress={() => router.push('/market')} haptic="light" style={{ marginTop: spacing(1.5), paddingHorizontal: 18, height: 44, borderRadius: 22, justifyContent: 'center', backgroundColor: colors.primary }}>
            <Text style={{ color: colors.onPrimary, fontFamily: fonts.semibold }}>{t('browseMarket')}</Text>
          </KPressable>
        </NovaCard>
      ) : (
        <NovaCard delay={140} padded={false} style={{ paddingHorizontal: spacing(2) }}>
          {alerts.map((a, i) => {
            const up = a.direction === 'above';
            return (
              <Rise key={a.id} delay={Math.min(i, 10) * 40} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), paddingVertical: spacing(1.5), borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.border }}>
                <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: up ? 'rgba(60,217,138,0.10)' : 'rgba(255,99,99,0.10)', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: up ? colors.up : colors.down, fontSize: 16, fontFamily: fonts.bold }}>{up ? '↑' : '↓'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={typography.bodyStrong}>{a.symbol.toUpperCase()}</Text>
                  <Text style={typography.muted}>
                    {up ? t('above') : t('below')} <Text style={{ color: colors.text, fontFamily: fonts.semibold }}>{a.target.toLocaleString(undefined)} {fiatSymbol(fiat)}</Text>
                  </Text>
                </View>
                <KPressable onPress={() => remove(a.id)} hitSlop={8} accessibilityLabel={t('deleteAction')}>
                  <IconDisc name="close" size={34} />
                </KPressable>
              </Rise>
            );
          })}
        </NovaCard>
      )}
    </PremiumScreen>
    </>
  );
}
