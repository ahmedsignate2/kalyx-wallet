import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { PremiumScreen, GlassCard } from '../ui/premium';
import { Icon } from '../ui/icon';
import { fonts, spacing, useTheme } from '../ui/theme';
import { useT } from '../lib/settingsStore';

interface QA { q: string; a: string; }
interface Section { title: string; items: QA[]; }

export default function Faq() {
  const { colors, typography } = useTheme();
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);
  const FAQ: Section[] = [
    { title: t('faqSecWallet'), items: [
      { q: t('faqQ1'), a: t('faqA1') },
      { q: t('faqQ2'), a: t('faqA2') },
      { q: t('faqQ3'), a: t('faqA3') },
      { q: t('faqQ4'), a: t('faqA4') },
    ] },
    { title: t('security'), items: [
      { q: t('faqQ5'), a: t('faqA5') },
      { q: t('faqQ6'), a: t('faqA6') },
      { q: t('faqQ7'), a: t('faqA7') },
      { q: t('faqQ8'), a: t('faqA8') },
    ] },
    { title: t('transactions'), items: [
      { q: t('faqQ9'), a: t('faqA9') },
      { q: t('faqQ10'), a: t('faqA10') },
      { q: t('faqQ11'), a: t('faqA11') },
      { q: t('faqQ12'), a: t('faqA12') },
    ] },
    { title: t('faqSecDapps'), items: [
      { q: t('faqQ13'), a: t('faqA13') },
      { q: t('faqQ14'), a: t('faqA14') },
      { q: t('faqQ15'), a: t('faqA15') },
      { q: t('faqQ16'), a: t('faqA16') },
    ] },
    { title: t('network'), items: [
      { q: t('faqQ17'), a: t('faqA17') },
      { q: t('faqQ18'), a: t('faqA18') },
    ] },
  ];

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('faq') }} />
      <PremiumScreen>
      <ScrollView contentContainerStyle={{ gap: spacing(2), paddingBottom: spacing(4) }} showsVerticalScrollIndicator={false}>
        {FAQ.map((section) => (
          <View key={section.title} style={{ gap: spacing(1) }}>
            <Text style={typography.section}>{section.title}</Text>
            <GlassCard style={{ paddingVertical: spacing(0.5) }}>
              {section.items.map((qa, i) => {
                const id = section.title + i;
                const expanded = open === id;
                return (
                  <View key={id} style={{ borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.glassBorder }}>
                    <Pressable onPress={() => setOpen(expanded ? null : id)} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1), paddingVertical: spacing(1.5) }}>
                      <Text style={[typography.bodyStrong, { flex: 1, fontSize: 15 }]}>{qa.q}</Text>
                      <View style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}>
                        <Icon name="chevron" size={16} color={colors.textMuted} />
                      </View>
                    </Pressable>
                    {expanded ? <Text style={[typography.muted, { fontSize: 14, lineHeight: 20, paddingBottom: spacing(1.5) }]}>{qa.a}</Text> : null}
                  </View>
                );
              })}
            </GlassCard>
          </View>
        ))}
      </ScrollView>
    </PremiumScreen>
    </>
  );
}
