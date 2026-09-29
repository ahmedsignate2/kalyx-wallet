import { GOLD, NovaCard, NovaHero, Rise } from '../ui/nova';
import { ScreenHeader, Pressable as KPressable } from '../ui/kit';
import React, { useEffect } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { PremiumScreen, GlassCard } from '../ui/premium';
import { Icon, type IconName } from '../ui/icon';
import { fonts, spacing, useTheme } from '../ui/theme';
import { useNotifCenter, type NotifType } from '../lib/notificationCenter';
import { useT } from '../lib/settingsStore';

const ICON: Record<NotifType, IconName> = { tx: 'send', price: 'market', info: 'info' };

export default function Notifications() {
  const { colors, typography } = useTheme();
  const t = useT();
  const ago = (ts: number): string => {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return t('justNow');
    if (s < 3600) return t('minsAgo').replace('{n}', String(Math.floor(s / 60)));
    if (s < 86400) return t('hoursAgo').replace('{n}', String(Math.floor(s / 3600)));
    return new Date(ts).toLocaleDateString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };
  const items = useNotifCenter((s) => s.items);
  const markAllRead = useNotifCenter((s) => s.markAllRead);
  const clear = useNotifCenter((s) => s.clear);

  // Marque tout comme lu à l'ouverture.
  useEffect(() => {
    markAllRead();
  }, [markAllRead]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <PremiumScreen>
      <ScreenHeader
        right={items.length > 0 ? (
          <KPressable onPress={clear} haptic="light" accessibilityLabel={t('clearAll')} style={{ paddingHorizontal: 12, height: 34, borderRadius: 17, justifyContent: 'center', backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.textSecondary, fontSize: 13, fontFamily: fonts.semibold }}>{t('clearAll')}</Text>
          </KPressable>
        ) : undefined}
      />
      <NovaHero icon="bell" tone="gold" title={t('notifications')} subtitle={items.length === 0 ? t('notifEmptyHint') : undefined} />

      {items.length === 0 ? (
        <NovaCard delay={160} style={{ alignItems: 'center', paddingVertical: spacing(3) }}>
          <Text style={typography.bodyStrong}>{t('noNotifications')}</Text>
        </NovaCard>
      ) : (
        <NovaCard delay={140} padded={false} style={{ paddingHorizontal: spacing(2) }}>
          {items.map((n, i) => (
            <Rise key={n.id} delay={Math.min(i, 10) * 40} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), paddingVertical: spacing(1.5), borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.border }}>
              <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={ICON[n.type]} size={19} color={n.type === 'tx' ? colors.up : GOLD} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={typography.bodyStrong} numberOfLines={1}>{n.title}</Text>
                {n.body ? <Text style={typography.muted} numberOfLines={2}>{n.body}</Text> : null}
              </View>
              <Text style={{ color: colors.textTertiary, fontSize: 12 }}>{ago(n.at)}</Text>
            </Rise>
          ))}
        </NovaCard>
      )}
    </PremiumScreen>
    </>
  );
}
