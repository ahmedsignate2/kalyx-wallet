/**
 * Créer un portefeuille SUPPLÉMENTAIRE (depuis le Menu) — direction Nova.
 *
 * Deux temps. D'abord le nom, sous l'orbite ; le code de l'app se tape ensuite
 * sur le pavé Kalyx (fenêtre PIN), et non plus dans un champ texte où
 * n'importe quel clavier pouvait l'apprendre. Puis la phrase, mot par mot,
 * masquée tant que le doigt n'est pas posé dessus — comme à la création
 * du premier wallet.
 */
import React, { useEffect, useState } from 'react';
import { View, ScrollView, useWindowDimensions } from 'react-native';
import { KeyboardAvoid } from '../ui/KeyboardAvoid';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ScreenCapture from 'expo-screen-capture';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { ScreenHeader, Text, Button, Input, Surface, Pressable as KPressable } from '../ui/kit';
import { PinPromptModal } from '../ui/PinPromptModal';
import { Icon } from '../ui/icon';
import { useTheme } from '../ui/theme';
import { space, SCREEN_MARGIN, radius } from '../ui/tokens';
import { FlowDots, IconDisc, Orbit, Rise, SparkBurst, Stardust } from '../ui/nova';
import { useWallet } from '../lib/walletStore';
import { useSettings, useT } from '../lib/settingsStore';
import { friendlyTxError } from '../lib/txError';
import { haptic } from '../lib/haptics';
import { isWalletError } from '../src';

export default function CreateWallet() {
  const { colors } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const createWallet = useWallet((s) => s.createWallet);
  const pinLength = useSettings((s) => s.pinLength);
  const [label, setLabel] = useState('');
  const [askPin, setAskPin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pinError, setPinError] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [phrase, setPhrase] = useState<string[] | null>(null);
  const [held, setHeld] = useState(false);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    if (phrase) {
      ScreenCapture.preventScreenCaptureAsync('create').catch(() => {});
      return () => {
        ScreenCapture.allowScreenCaptureAsync('create').catch(() => {});
      };
    }
  }, [phrase]);

  // Masque des mots : levé tant que le doigt est posé sur la grille.
  const reveal = useSharedValue(0);
  useEffect(() => {
    reveal.value = withTiming(held ? 1 : 0, { duration: 160 });
  }, [held, reveal]);
  const wordsStyle = useAnimatedStyle(() => ({ opacity: reveal.value }));
  const maskStyle = useAnimatedStyle(() => ({ opacity: 1 - reveal.value }));

  const onCreate = async (pin: string) => {
    setBusy(true);
    try {
      const mnemonic = await createWallet(pin, label);
      setAskPin(false);
      haptic.success();
      setPhrase(mnemonic.split(' '));
    } catch (e) {
      // Seul un PIN faux fait secouer le pavé ; le reste est dit en clair.
      if (isWalletError(e) && e.code === 'WRONG_PIN') setPinError((n) => n + 1);
      else {
        setAskPin(false);
        setError(friendlyTxError(e, t as never));
      }
    } finally {
      setBusy(false);
    }
  };

  if (phrase) {
    const half = Math.ceil(phrase.length / 2);
    const cols = [phrase.slice(0, half), phrase.slice(half)];
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <ScrollView contentContainerStyle={{ paddingTop: insets.top, paddingHorizontal: SCREEN_MARGIN, paddingBottom: insets.bottom + space[5], gap: space[4], flexGrow: 1 }} showsVerticalScrollIndicator={false}>
          <ScreenHeader title={t('saveYourPhrase')} right={<FlowDots step={2} total={2} />} />
          <Rise>
            <Text variant="bodySecondary" tone="secondary">{t('writeWordsHint').replace('{n}', String(phrase.length))}</Text>
          </Rise>
          <KPressable
            noScale
            haptic="none"
            onPressIn={() => { setHeld(true); setSeen(true); haptic.light(); }}
            onPressOut={() => setHeld(false)}
            accessibilityLabel={t('holdToReveal')}
          >
            <Surface style={{ flexDirection: 'row', gap: space[3], borderRadius: 26 }}>
              {cols.map((col, c) => (
                <View key={c} style={{ flex: 1, gap: space[2] }}>
                  {col.map((w, i) => {
                    const n = c * half + i + 1;
                    return (
                      <Rise key={n} delay={120 + (n - 1) * 45} style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], height: 40, paddingHorizontal: space[3], borderRadius: radius.input, backgroundColor: colors.surface2 }}>
                        <Text variant="caption" tone="tertiary" tabular style={{ width: 22 }}>{n}</Text>
                        <View style={{ flex: 1, justifyContent: 'center' }}>
                          <Animated.View style={wordsStyle}><Text variant="body">{w}</Text></Animated.View>
                          <Animated.View style={[{ position: 'absolute', left: 0 }, maskStyle]}><Text variant="body" tone="tertiary">••••••</Text></Animated.View>
                        </View>
                      </Rise>
                    );
                  })}
                </View>
              ))}
            </Surface>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[1], marginTop: space[2] }}>
              <Icon name={held ? 'eye' : 'eyeOff'} size={14} tone="muted" />
              <Text variant="caption" tone="secondary">{held ? t('releaseToHide') : t('holdToReveal')}</Text>
            </View>
          </KPressable>
          <View style={{ flex: 1 }} />
          <Button label={t('notedFinish')} disabled={!seen} onPress={() => router.replace('/home')} />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <Stardust width={winW} height={winH} count={10} />
      {/* Clavier ouvert (nom du portefeuille) : le bouton « Créer » reste visible, le reste défile. */}
      <KeyboardAvoid style={{ flex: 1 }}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top, paddingHorizontal: SCREEN_MARGIN, paddingBottom: insets.bottom + space[4], gap: space[4] }}>
        <ScreenHeader right={<FlowDots step={1} total={2} />} />

        {/* Héros : le disque « créer » au centre de son orbite, qui naît puis tourne. */}
        <View style={{ alignItems: 'center', gap: space[3], paddingVertical: space[4] }}>
          <View style={{ width: 88, height: 88, alignItems: 'center', justifyContent: 'center' }}>
            <View pointerEvents="none" style={{ position: 'absolute', left: 44, top: 44 }}><Orbit cx={0} cy={0} r={64} /></View>
            <IconDisc name="create" tone="gold" size={80} />
            <SparkBurst burstKey="born" count={24} radius={60} />
          </View>
          <Rise delay={80}><Text variant="title1" style={{ textAlign: 'center' }}>{t('createWalletT')}</Text></Rise>
          <Rise delay={150}><Text variant="bodySecondary" tone="secondary" style={{ textAlign: 'center', maxWidth: 320 }}>{t('newPhraseGenerated')}</Text></Rise>
        </View>

        <Rise delay={220}>
          <Input label={t('nameOptional')} value={label} onChangeText={setLabel} placeholder={t('namePlaceholderCreate')} autoCapitalize="words" returnKeyType="done" />
        </Rise>
        {error ? <Text variant="caption" tone="danger">{error}</Text> : null}
        <View style={{ flex: 1 }} />
        <Button label={busy ? t('creating') : t('createAction')} loading={busy} onPress={() => { setError(null); setAskPin(true); }} />
      </ScrollView>
      </KeyboardAvoid>

      <PinPromptModal
        visible={askPin}
        title={t('appPin')}
        subtitle={t('enterAppPinEncryptNew')}
        expectedLength={pinLength}
        busy={busy}
        errorSignal={pinError}
        onSubmit={onCreate}
        onCancel={() => setAskPin(false)}
      />
    </View>
  );
}
