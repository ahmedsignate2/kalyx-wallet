import React from 'react';
import { View, Text, Switch, ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { PremiumScreen, GlassCard } from '../ui/premium';
import { Icon, type IconName } from '../ui/icon';
import { spacing, useTheme } from '../ui/theme';
import { useSettings } from '../lib/settingsStore';

/**
 * Modules & fonctions : active/désactive des capacités optionnelles de Nova.
 * Chaque bascule agit vraiment sur l'app (pas de placeholder).
 */
export default function Extensions() {
  const { colors, typography } = useTheme();
  const { securityScan, uiMode, setFlag, setUiMode } = useSettings();

  const modules: { icon: IconName; title: string; sub: string; value: boolean; onChange: (v: boolean) => void }[] = [
    {
      icon: 'security',
      title: 'Analyse de sécurité (GoPlus)',
      sub: 'Vérifie les contrats et sites avant signature.',
      value: securityScan,
      onChange: (v) => setFlag('securityScan', v),
    },
    {
      icon: 'developer',
      title: 'Mode expert',
      sub: 'Détails avancés (frais, données brutes, routes de swap).',
      value: uiMode === 'expert',
      onChange: (v) => setUiMode(v ? 'expert' : 'beginner'),
    },
  ];

  return (
    <PremiumScreen>
      <Stack.Screen options={{ headerShown: true, title: 'Extensions' }} />
      <ScrollView contentContainerStyle={{ gap: spacing(1.5), paddingBottom: spacing(4) }} showsVerticalScrollIndicator={false}>
        <Text style={typography.muted}>Active ou désactive les fonctions optionnelles de Nova.</Text>
        {modules.map((m) => (
          <GlassCard key={m.title} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
            <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.glassStrong, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={m.icon} size={20} color={m.value ? colors.accent : colors.textMuted} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={typography.bodyStrong}>{m.title}</Text>
              <Text style={typography.muted}>{m.sub}</Text>
            </View>
            <Switch value={m.value} onValueChange={m.onChange} />
          </GlassCard>
        ))}
      </ScrollView>
    </PremiumScreen>
  );
}
