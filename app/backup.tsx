import { useT } from "../lib/settingsStore";
/**
 * Phrase de récupération (§4.9) — 12 mots en 2 colonnes numérotées, MASQUÉS
 * tant que le doigt n'est pas maintenu dessus. Captures bloquées (FLAG_SECURE).
 * Pas de bouton copier. « Ces 12 mots sont ton wallet. Qui les a peut tout
 * prendre. Kalyx ne peut pas les récupérer pour toi. »
 * Sauter la sauvegarde = bandeau permanent sur l'accueil + point dans Sécurité.
 */
import React, { useEffect, useState } from 'react';
import { View, ScrollView, Pressable as RNPressable, Platform } from 'react-native';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ScreenCapture from 'expo-screen-capture';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Text, Button, IconButton, Surface, EmptyState } from '../ui/kit';
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
        <Surface><EmptyState icon="phrase" title={t('sessionExpired')} body="Recommence la création du wallet." actionLabel="Recommencer" onAction={() => router.replace('/welcome')} /></Surface>
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
        <Text variant="title2" style={{ flex: 1 }}>Ta phrase de récupération</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: SCREEN_MARGIN, paddingBottom: insets.bottom + space[6], gap: space[5], flexGrow: 1 }}>
        <Text variant="body">Ces {words.length} mots sont ton wallet. Qui les a peut tout prendre. Kalyx ne peut pas les récupérer pour toi.</Text>
        <Text variant="bodySecondary" tone="secondary">Écris-les sur papier, dans l'ordre. Pas de photo, pas de cloud.{Platform.OS === 'android' ? ' Les captures d’écran sont bloquées ici.' : ''}</Text>

        {/* Grille masquée tant que le doigt n'est pas dessus */}
        <RNPressable
          onPressIn={() => { setHeld(true); setSeen(true); haptic.light(); }}
          onPressOut={() => setHeld(false)}
          accessibilityLabel="Maintenir pour afficher la phrase"
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
            <Text variant="caption" tone="secondary">{held ? 'Relâche pour masquer' : 'Maintiens le doigt pour afficher · assure-toi que personne ne regarde'}</Text>
          </View>
        </RNPressable>

        <View style={{ flex: 1 }} />
        <Button label={t('phraseNoted')} onPress={() => router.push('/verify')} disabled={!seen} />
        <Button label={t("actionLater")} variant="ghost" onPress={() => router.push('/set-pin')} />
      </ScrollView>
    </View>
  );
}
