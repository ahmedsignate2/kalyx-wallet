/**
 * Liste des alertes de prix. Création depuis la fiche d'un token (icône 🔔).
 * Vérifiées quand l'app est ouverte (voir ui/PriceAlertWatcher) ; one-shot.
 */
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Stack, router } from 'expo-router';
import { PremiumScreen, GlassCard } from '../ui/premium';
import { Icon } from '../ui/icon';
import { fonts, spacing, useTheme } from '../ui/theme';
import { usePriceAlerts } from '../lib/priceAlertsStore';
import { useSettings, fiatSymbol } from '../lib/settingsStore';

export default function PriceAlerts() {
  const { colors, typography } = useTheme();
  const alerts = usePriceAlerts((s) => s.alerts);
  const remove = usePriceAlerts((s) => s.remove);
  const fiat = useSettings((s) => s.fiat);

  return (
    <PremiumScreen>
      <Stack.Screen options={{ headerShown: true, title: 'Alertes de prix' }} />
      <Text style={typography.muted}>
        Reçois une notification quand un actif franchit un seuil. Les alertes sont vérifiées
        quand l’app est ouverte, et disparaissent une fois déclenchées.
      </Text>

      {alerts.length === 0 ? (
        <GlassCard style={{ alignItems: 'center', gap: spacing(1), paddingVertical: spacing(3) }}>
          <Icon name="info" size={30} color={colors.textMuted} />
          <Text style={typography.bodyStrong}>Aucune alerte</Text>
          <Text style={[typography.muted, { textAlign: 'center' }]}>Ouvre la fiche d’un token et touche 🔔 pour créer une alerte.</Text>
          <Pressable onPress={() => router.push('/market')} style={{ marginTop: spacing(1) }}>
            <Text style={{ color: colors.accent, fontFamily: fonts.semibold }}>Parcourir le marché →</Text>
          </Pressable>
        </GlassCard>
      ) : (
        <GlassCard style={{ paddingVertical: spacing(0.5) }}>
          {alerts.map((a, i) => (
            <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), paddingVertical: spacing(1.5), borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.glassBorder }}>
              <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: colors.glassStrong, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: a.direction === 'above' ? colors.up : colors.down, fontSize: 18, fontFamily: fonts.bold }}>{a.direction === 'above' ? '▲' : '▼'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={typography.bodyStrong}>{a.symbol.toUpperCase()}</Text>
                <Text style={typography.muted}>
                  {a.direction === 'above' ? 'Au-dessus de' : 'En-dessous de'} {a.target.toLocaleString('fr-FR')} {fiatSymbol(fiat)}
                </Text>
              </View>
              <Pressable onPress={() => remove(a.id)} hitSlop={8} style={{ padding: 6 }}>
                <Icon name="close" size={18} tone="muted" />
              </Pressable>
            </View>
          ))}
        </GlassCard>
      )}
    </PremiumScreen>
  );
}
