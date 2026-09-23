import { useT } from "../lib/settingsStore";
/**
 * Phrase de récupération (§4.9) — 12 mots en 2 colonnes numérotées, MASQUÉS
 * tant que le doigt n'est pas maintenu dessus. Captures bloquées (FLAG_SECURE).
 * Pas de bouton copier. Tous les textes viennent de l'i18n (clé
 * `seedOwnershipWarning` pour l'avertissement principal) : l'écran avait été
 * réécrit en français codé en dur, alors que des traductions existaient déjà.
 * Sauter la sauvegarde = bandeau permanent sur l'accueil + point dans Sécurité.
 */
import React, { useEffect, useState } from 'react';
import { View, ScrollView, Platform } from 'react-native';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ScreenCapture from 'expo-screen-capture';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Text, Button, IconButton, Surface, EmptyState, Pressable as KPressable } from '../ui/kit';
import { Icon } from '../ui/icon';
import { useTheme } from '../ui/theme';
import { space, SCREEN_MARGIN, radius, durations } from '../ui/tokens';
import { useWallet } from '../lib/walletStore';
import { haptic } from '../lib/haptics';

export default function Backup() {
  const t = useT();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const draft = useWallet((s) => s.draftMnemonic);
  const [held, setHeld] = useState(false);
  const [seen, setSeen] = useState(false);
  const reveal = useSharedValue(0);

  useEffect(() => {
    ScreenCapture.preventScreenCaptureAsync('seed').catch(() => {});
    return () => {
      ScreenCapture.allowScreenCaptureAsync('seed').catch(() => {});
    };
  }, []);
  useEffect(() => {
    reveal.value = withTiming(held ? 1 : 0, { duration: durations.fade });
  }, [held, reveal]);
  const wordsStyle = useAnimatedStyle(() => ({ opacity: reveal.value }));
  const maskStyle = useAnimatedStyle(() => ({ opacity: 1 - reveal.value }));

  if (!draft) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 48, paddingHorizontal: SCREEN_MARGIN }}>
        <Stack.Screen options={{ headerShown: false }} />
        <Surface><EmptyState icon="phrase" title={t('sessionExpired')} body={t('noPhraseToShow')} actionLabel={t('startOver')} onAction={() => router.replace('/welcome')} /></Surface>
      </View>
    );
  }
  const words = draft.split(' ');
  const half = Math.ceil(words.length / 2);
  const cols = [words.slice(0, half), words.slice(half)];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ paddingTop: insets.top, paddingHorizontal: SCREEN_MARGIN, height: insets.top + 48, flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <IconButton icon="back" label={t("back")} tone="ghost" onPress={() => router.back()} />
        <Text variant="title2" style={{ flex: 1 }}>{t('yourRecoveryPhrase')}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: SCREEN_MARGIN, paddingBottom: insets.bottom + space[6], gap: space[5], flexGrow: 1 }}>
        <Text variant="body">{t('seedOwnershipWarning').replace('{n}', String(words.length))}</Text>
        <Text variant="bodySecondary" tone="secondary">
          {words.length} {t('wordsInOrderHint')} {t('backupWarning')}
          {Platform.OS === 'android' ? t('screenshotBlocked') : ''}
        </Text>

        {/* Grille masquée tant que le doigt n'est pas dessus */}
        <KPressable
          noScale
          haptic="none"
          onPressIn={() => { setHeld(true); setSeen(true); haptic.light(); }}
          onPressOut={() => setHeld(false)}
          accessibilityLabel={t('holdToReveal')}
        >
          <Surface style={{ flexDirection: 'row', gap: space[3] }}>
            {cols.map((col, c) => (
              <View key={c} style={{ flex: 1, gap: space[2] }}>
                {col.map((w, i) => {
                  const n = c * half + i + 1;
                  return (
                    <View key={n} style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], height: 40, paddingHorizontal: space[3], borderRadius: radius.input, backgroundColor: colors.surface2 }}>
                      <Text variant="caption" tone="tertiary" tabular style={{ width: 22 }}>{n}</Text>
                      <View style={{ flex: 1, justifyContent: 'center' }}>
                        <Animated.View style={wordsStyle}><Text variant="body">{w}</Text></Animated.View>
                        <Animated.View style={[{ position: 'absolute', left: 0 }, maskStyle]}><Text variant="body" tone="tertiary">••••••</Text></Animated.View>
                      </View>
                    </View>
                  );
                })}
              </View>
            ))}
          </Surface>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[1], marginTop: space[2] }}>
            <Icon name={held ? 'eye' : 'eyeOff'} size={14} tone="muted" />
            <Text variant="caption" tone="secondary">{held ? t('releaseToHide') : `${t('holdToReveal')} · ${t('makeSureNobody')}`}</Text>
          </View>
        </KPressable>

        <View style={{ flex: 1 }} />
        <Button label={t('phraseNoted')} onPress={() => router.push('/verify')} disabled={!seen} />
        <Button label={t("actionLater")} variant="ghost" onPress={() => router.push('/set-pin')} />
      </ScrollView>
    </View>
  );
}
