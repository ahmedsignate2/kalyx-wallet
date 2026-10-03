import { NovaCard, NovaHero, Pills } from '../ui/nova';
import { ScreenHeader } from '../ui/kit';
import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { PremiumScreen, GlassCard, SegmentedTabs } from '../ui/premium';
import { spacing, useTheme } from '../ui/theme';
import { useT, useSettings } from '../lib/settingsStore';
import { legalFor, type LegalSection } from '../lib/legalText';

export default function Legal() {
  const { colors, typography } = useTheme();
  const t = useT();
  const { doc } = useLocalSearchParams<{ doc?: string }>();
  const [tab, setTab] = useState(doc === 'terms' ? 'terms' : 'privacy');
  const language = useSettings((st) => st.language);
  const legal = legalFor(language);
  const sections: LegalSection[] = tab === 'terms' ? legal.terms : legal.privacy;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <PremiumScreen>
      <ScreenHeader />
      <NovaHero icon="about" title={t('legalNotice')} subtitle={`${t('lastUpdated')} ${legal.updated}`} />
      <View style={{ alignItems: 'center' }}>
        <Pills
          items={[
            { key: 'privacy', label: t('privacyShort') },
            { key: 'terms', label: t('termsShort') },
          ]}
          value={tab}
          onChange={(k) => setTab(k as typeof tab)}
        />
      </View>
      <ScrollView contentContainerStyle={{ gap: spacing(1.5), paddingBottom: spacing(4) }} showsVerticalScrollIndicator={false}>
        {sections.map((s, i) => (
          <NovaCard key={`${tab}-${s.title}`} delay={Math.min(i, 6) * 50} style={{ gap: spacing(0.75) }}>
            <Text style={typography.bodyStrong}>{s.title}</Text>
            <Text style={[typography.muted, { fontSize: 14, lineHeight: 21 }]}>{s.body}</Text>
          </NovaCard>
        ))}
      </ScrollView>
    </PremiumScreen>
    </>
  );
}
