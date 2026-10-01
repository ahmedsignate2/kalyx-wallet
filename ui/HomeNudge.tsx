/**
 * CARTE D'ACTION de l'accueil — le point de sécurité le plus important qui
 * reste à régler, et UN seul à la fois (une pile de bannières se lit comme du
 * bruit) : pas de sauvegarde chiffrée, puis biométrie coupée (seulement si le
 * téléphone en a une). La phrase non vérifiée a déjà sa bannière sur l'accueil :
 * la répéter ici ferait deux alertes pour la même chose. Écartée d'un geste, elle revient au bout de sept jours :
 * un rappel, pas un harcèlement. Rien quand tout est fait.
 */
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text, Pressable as KPressable } from './kit';
import { IconDisc } from './nova';
import { Icon, type IconName } from './icon';
import { useTheme } from './theme';
import { fontFamily } from './tokens';
import { useSettings, useT } from '../lib/settingsStore';
import { isBiometricAvailable } from '../lib/biometrics';

const SNOOZE_MS = 7 * 24 * 3600 * 1000;
const key = (id: string) => `kalyx.nudge.${id}`;

type Nudge = { id: string; icon: IconName; title: string; body: string; cta: string; go: () => void };

export function HomeNudge() {
  const { colors } = useTheme();
  const t = useT();
  const encrypted = useSettings((s) => s.encryptedBackupAt !== null);
  const biometric = useSettings((s) => s.biometricEnabled);
  const [snoozed, setSnoozed] = useState<Record<string, boolean> | null>(null);
  /** Biométrie disponible sur CE téléphone : sinon, rien à activer (Réglages n'a pas le réglage). */
  const [bioAvailable, setBioAvailable] = useState(false);
  useEffect(() => {
    isBiometricAvailable().then(setBioAvailable).catch(() => setBioAvailable(false));
  }, []);

  const all: Nudge[] = [
    ...(!encrypted ? [{ id: 'backup', icon: 'share' as IconName, title: t('encBackup'), body: t('encBackupTodoMsg'), cta: t('createBackupBtn'), go: () => router.push('/cloud-backup') }] : []),
    ...(!biometric && bioAvailable ? [{ id: 'bio', icon: 'security' as IconName, title: t('biometrics'), body: t('biometricsDisabledMsg'), cta: t('enable'), go: () => router.push('/settings') }] : []),
  ];
  const ids = all.map((n) => n.id).join(',');

  useEffect(() => {
    let alive = true;
    Promise.all(all.map(async (n) => [n.id, Number(await AsyncStorage.getItem(key(n.id)).catch(() => null)) || 0] as const)).then((rows) => {
      if (!alive) return;
      const now = Date.now();
      setSnoozed(Object.fromEntries(rows.map(([id, at]) => [id, now - at < SNOOZE_MS])));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  if (!snoozed) return null;
  const n = all.find((x) => !snoozed[x.id]);
  if (!n) return null;
  const dismiss = () => {
    AsyncStorage.setItem(key(n.id), String(Date.now())).catch(() => {});
    setSnoozed((s) => ({ ...(s ?? {}), [n.id]: true }));
  };
  return (
    <View style={{ flexDirection: 'row', gap: 12, padding: 14, borderRadius: 22, backgroundColor: colors.surface1, borderWidth: 1, borderColor: 'rgba(255,181,71,0.28)' }}>
      <IconDisc name={n.icon} tone="gold" size={40} />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text variant="body" style={{ fontFamily: fontFamily.semibold }}>{n.title}</Text>
        <Text variant="caption" tone="secondary">{n.body}</Text>
        <KPressable onPress={n.go} haptic="light" hitSlop={8} accessibilityRole="button" accessibilityLabel={n.cta} style={{ alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 14, height: 32, borderRadius: 16, justifyContent: 'center', backgroundColor: colors.primary }}>
          <Text variant="caption" style={{ color: colors.onPrimary, fontFamily: fontFamily.semibold }}>{n.cta}</Text>
        </KPressable>
      </View>
      <KPressable onPress={dismiss} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('close')}>
        <Icon name="close" size={16} color={colors.textTertiary} />
      </KPressable>
    </View>
  );
}
