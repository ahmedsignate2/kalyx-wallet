import { GOLD, NovaCard, NovaHero, Rise, SectionLabel } from '../ui/nova';
import { ScreenHeader, Pressable as KPressable } from '../ui/kit';
import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { PremiumScreen, GlassCard } from '../ui/premium';
import { Icon } from '../ui/icon';
import { fonts, spacing, useTheme } from '../ui/theme';
import { useT } from '../lib/settingsStore';
import { FAQ_SECTIONS } from '../lib/faqContent';

interface QA { q: string; a: string; }
interface Section { title: string; items: QA[]; }

export default function Faq() {
  const { colors, typography } = useTheme();
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);
  const FAQ: Section[] = FAQ_SECTIONS.map((sec) => ({ title: t(sec.title), items: sec.items.map((x) => ({ q: t(x.q), a: t(x.a) })) }));

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <PremiumScreen>
      <ScreenHeader />
      <NovaHero icon="faq" title={t('faq')} />
      <ScrollView contentContainerStyle={{ gap: spacing(2), paddingBottom: spacing(4) }} showsVerticalScrollIndicator={false}>
        {FAQ.map((section, si) => (
          <View key={section.title} style={{ gap: spacing(1.25) }}>
            <SectionLabel>{section.title}</SectionLabel>
            <NovaCard delay={Math.min(si, 6) * 60} style={{ paddingVertical: spacing(0.5) }}>
              {section.items.map((qa, i) => {
                const id = section.title + i;
                const expanded = open === id;
                return (
                  <View key={id} style={{ borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.border }}>
                    <KPressable onPress={() => setOpen(expanded ? null : id)} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1), paddingVertical: spacing(1.5) }}>
                      <Text style={[typography.bodyStrong, { flex: 1, fontSize: 15 }]}>{qa.q}</Text>
                      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: expanded ? 'rgba(221,181,101,0.14)' : colors.surface2, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}>
                        <Icon name="chevron" size={14} color={expanded ? GOLD : colors.textSecondary} />
                      </View>
                    </KPressable>
                    {expanded ? <Rise><Text style={[typography.muted, { fontSize: 14, lineHeight: 21, paddingBottom: spacing(1.5) }]}>{qa.a}</Text></Rise> : null}
                  </View>
                );
              })}
            </NovaCard>
          </View>
        ))}
      </ScrollView>
    </PremiumScreen>
    </>
  );
}
