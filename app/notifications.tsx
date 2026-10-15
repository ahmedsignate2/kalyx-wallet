/**
 * NOTIFICATIONS — ce qui s'est passé, rangé et filtrable.
 *
 * Filtres par type (transactions, alertes de prix, infos) avec leur nombre,
 * groupes par jour, point « nouveau » sur ce qui n'avait pas été vu, appui long
 * pour supprimer une ligne, et les réglages de réception sur place — plus
 * besoin d'aller les chercher dans Réglages.
 */
import { NovaHero, Rise, Pills, IconDisc, SectionLabel } from '../ui/nova';
import { ScreenHeader, Pressable as KPressable, Card, Screen } from '../ui/kit';
import { useCallback, useMemo, useState } from 'react';
import { View, Text, Switch, Alert } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { type IconName } from '../ui/icon';
import { fonts, spacing, useTheme, fontSize, radii } from '../ui/theme';
import { useNotifCenter, type NotifType, type NotifItem } from '../lib/notificationCenter';
import { useSettings, useT } from '../lib/settingsStore';
import { haptic } from '../lib/haptics';
import type { ActionTint } from '../ui/tokens';

const ICON: Record<NotifType, { icon: IconName; tint: ActionTint }> = {
  tx: { icon: 'send', tint: 'send' },
  price: { icon: 'market', tint: 'swap' },
  info: { icon: 'info', tint: 'earn' },
};

type Filter = 'all' | NotifType;

/** Début du jour local (ms). */
const dayStart = (ts: number) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export default function Notifications() {
  const { colors, typography } = useTheme();
  const t = useT();
  const items = useNotifCenter((s) => s.items);
  const markAllRead = useNotifCenter((s) => s.markAllRead);
  const remove = useNotifCenter((s) => s.remove);
  const clear = useNotifCenter((s) => s.clear);
  const notifTx = useSettings((s) => s.notifTx);
  const notifPrice = useSettings((s) => s.notifPrice);
  const setNotifPref = useSettings((s) => s.setNotifPref);
  const [filter, setFilter] = useState<Filter>('all');

  /*
   * Ce qui n'avait pas été vu À L'OUVERTURE garde son point « nouveau » le
   * temps de la visite ; tout est marqué lu en partant.
   */
  const [unseen] = useState(() => new Set(useNotifCenter.getState().items.filter((i) => !i.read).map((i) => i.id)));
  useFocusEffect(useCallback(() => () => markAllRead(), [markAllRead]));

  const time = (ts: number) => new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const count = (f: Filter) => (f === 'all' ? items.length : items.filter((i) => i.type === f).length);
  const shown = useMemo(() => (filter === 'all' ? items : items.filter((i) => i.type === filter)), [items, filter]);

  /* Groupes : aujourd'hui, hier, puis plus tôt. */
  const groups = useMemo(() => {
    const today = dayStart(Date.now());
    const out: { key: string; label: string; items: NotifItem[] }[] = [];
    for (const n of shown) {
      const d = dayStart(n.at);
      const key = d === today ? 'today' : d === today - 86400_000 ? 'yesterday' : 'earlier';
      const label = key === 'today' ? t('notifToday') : key === 'yesterday' ? t('notifYesterday') : t('notifEarlier');
      const g = out.find((x) => x.key === key);
      if (g) g.items.push(n);
      else out.push({ key, label, items: [n] });
    }
    return out;
  }, [shown, t]);

  const askClear = () =>
    Alert.alert(t('notifClearConfirm'), undefined, [
      { text: t('cancel'), style: 'cancel' },
      { text: t('clearAll'), style: 'destructive', onPress: clear },
    ]);

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: `${t('notifAll')} · ${count('all')}` },
    ...(count('tx') ? [{ key: 'tx' as const, label: `${t('transactions')} · ${count('tx')}` }] : []),
    ...(count('price') ? [{ key: 'price' as const, label: `${t('priceAlerts')} · ${count('price')}` }] : []),
    ...(count('info') ? [{ key: 'info' as const, label: `${t('notifInfo')} · ${count('info')}` }] : []),
  ];

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Screen>
        <ScreenHeader
          right={items.length > 0 ? (
            <KPressable onPress={askClear} haptic="light" accessibilityLabel={t('clearAll')} style={{ paddingHorizontal: 12, height: 34, borderRadius: radii.full, justifyContent: 'center', backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm, fontFamily: fonts.semibold }}>{t('clearAll')}</Text>
            </KPressable>
          ) : undefined}
        />
        <NovaHero icon="bell" tone="gold" title={t('notifications')} subtitle={items.length === 0 ? t('notifEmptyHint') : t('notifLongPressHint')} />

        {items.length > 1 && filters.length > 2 ? (
          <View style={{ marginBottom: spacing(1) }}>
            <Pills items={filters} value={filter} onChange={(k) => setFilter(k)} />
          </View>
        ) : null}

        {items.length === 0 ? (
          <Card rise delay={160} style={{ alignItems: 'center', paddingVertical: spacing(4), gap: spacing(1.5) }}>
            <IconDisc name="bell" tone="gold" size={56} />
            <Text style={typography.bodyStrong}>{t('noNotifications')}</Text>
          </Card>
        ) : (
          groups.map((g, gi) => (
            <View key={g.key} style={{ gap: spacing(1) }}>
              <SectionLabel>{g.label}</SectionLabel>
              <Card rise delay={120 + gi * 60} padded={false} style={{ paddingHorizontal: spacing(2) }}>
                {g.items.map((n, i) => {
                  const k = ICON[n.type];
                  const fresh = unseen.has(n.id);
                  return (
                    <Rise key={n.id} delay={Math.min(i, 10) * 35}>
                      <KPressable
                        onLongPress={() => {
                          haptic.light();
                          remove(n.id);
                        }}
                        accessibilityHint={t('notifLongPressHint')}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), paddingVertical: spacing(1.5), borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.border }}
                      >
                        <IconDisc name={k.icon} tint={k.tint} size={42} />
                        <View style={{ flex: 1 }}>
                          <Text style={typography.bodyStrong} numberOfLines={1}>{n.title}</Text>
                          {n.body ? <Text style={typography.muted} numberOfLines={2}>{n.body}</Text> : null}
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 6 }}>
                          <Text style={{ color: colors.textTertiary, fontSize: fontSize.xs }}>{time(n.at)}</Text>
                          {fresh ? <View accessibilityLabel={t('notifNew')} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.warm }} /> : null}
                        </View>
                      </KPressable>
                    </Rise>
                  );
                })}
              </Card>
            </View>
          ))
        )}

        {/* Réception, réglée ici même */}
        <SectionLabel>{t('notifReceive')}</SectionLabel>
        <Card rise delay={220}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), minHeight: 48 }}>
            <IconDisc name="send" tint="send" size={34} />
            <Text style={[typography.body, { flex: 1 }]}>{t('transactions')}</Text>
            <Switch value={notifTx} onValueChange={(v) => setNotifPref('notifTx', v)} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.5), minHeight: 48, borderTopWidth: 1, borderTopColor: colors.border }}>
            <IconDisc name="market" tint="swap" size={34} />
            <Text style={[typography.body, { flex: 1 }]}>{t('priceAlerts')}</Text>
            <Switch value={notifPrice} onValueChange={(v) => setNotifPref('notifPrice', v)} />
          </View>
        </Card>
      </Screen>
    </>
  );
}
