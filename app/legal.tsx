import { ScreenHeader } from '../ui/kit';
import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { PremiumScreen, GlassCard, SegmentedTabs } from '../ui/premium';
import { spacing, useTheme } from '../ui/theme';
import { useT } from '../lib/settingsStore';
import { PRIVACY, TERMS, LEGAL_UPDATED, type LegalSection } from '../lib/legalText';

export default function Legal() {
  const { colors, typography } = useTheme();
  const t = useT();
  const { doc } = useLocalSearchParams<{ doc?: string }>();
  const [tab, setTab] = useState(doc === 'terms' ? 'terms' : 'privacy');
  const sections: LegalSection[] = tab === 'terms' ? TERMS : PRIVACY;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <PremiumScreen>
      <ScreenHeader title={t('legalNotice')} />
      <SegmentedTabs
        items={[
          { key: 'privacy', label: t('privacyShort') },
          { key: 'terms', label: t('termsShort') },
        ]}
        active={tab}
        onChange={setTab}
      />
      <Text style={[typography.muted, { fontSize: 12 }]}>{t('lastUpdated')} {LEGAL_UPDATED}</Text>
      <ScrollView contentContainerStyle={{ gap: spacing(1.5), paddingBottom: spacing(4) }} showsVerticalScrollIndicator={false}>
        {sections.map((s) => (
          <GlassCard key={s.title} style={{ gap: spacing(0.75) }}>
            <Text style={typography.bodyStrong}>{s.title}</Text>
            <Text style={[typography.muted, { fontSize: 14, lineHeight: 20 }]}>{s.body}</Text>
          </GlassCard>
        ))}
      </ScrollView>
    </PremiumScreen>
    </>
  );
}
