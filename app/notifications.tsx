import { ScreenHeader } from '../ui/kit';
import React, { useEffect } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
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
      <ScreenHeader title={t('notifications')} />

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={typography.title}>{t('notifications')}</Text>
        {items.length > 0 ? (
          <Pressable onPress={clear} hitSlop={8}>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>{t('clearAll')}</Text>
          </Pressable>
        ) : null}
      </View>

      {items.length === 0 ? (
        <GlassCard>
          <View style={{ alignItems: 'center', paddingVertical: spacing(3), gap: spacing(1) }}>
            <Icon name="notifications" size={30} color={colors.textMuted} />
            <Text style={typography.bodyStrong}>{t('noNotifications')}</Text>
            <Text style={[typography.muted, { textAlign: 'center' }]}>{t('notifEmptyHint')}</Text>
          </View>
        </GlassCard>
      ) : (
        <ScrollView contentContainerStyle={{ gap: spacing(1.25), paddingBottom: spacing(4) }} showsVerticalScrollIndicator={false}>
          {items.map((n) => (
            <GlassCard key={n.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5) }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.glassStrong, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={ICON[n.type]} size={19} color={n.type === 'tx' ? colors.up : colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={typography.bodyStrong} numberOfLines={1}>{n.title}</Text>
                {n.body ? <Text style={typography.muted} numberOfLines={2}>{n.body}</Text> : null}
              </View>
              <Text style={{ color: colors.textFaint, fontSize: 12 }}>{ago(n.at)}</Text>
            </GlassCard>
          ))}
        </ScrollView>
      )}
    </PremiumScreen>
    </>
  );
}
