/**
 * Bienvenue (§4.9) — LE seul moment orchestré de l'app : le halo naît d'un
 * point et s'ouvre (ressort Doux), le nom apparaît. 1,5 s max, passable d'un
 * tap. Puis « Créer un wallet » / « J'ai déjà un wallet ».
 * « Réduire les animations » : tout est visible immédiatement.
 */
import React, { useEffect, useState } from 'react';
import { View, Pressable as RNPressable } from 'react-native';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming, useReducedMotion } from 'react-native-reanimated';
import { Text, Button, Halo, Surface } from '../ui/kit';
import { Icon, type IconName } from '../ui/icon';
import { useTheme } from '../ui/theme';
import { space, SCREEN_MARGIN, springs, durations, radius } from '../ui/tokens';
import { useWallet } from '../lib/walletStore';
import { useT } from '../lib/settingsStore';

export default function Welcome() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const t = useT();
  const reduced = useReducedMotion();
  const newDraft = useWallet((s) => s.newDraft);
  const [ready, setReady] = useState(false);

  const halo = useSharedValue(0);
  const name = useSharedValue(0);
  const rest = useSharedValue(0);
  useEffect(() => {
    if (reduced) {
      halo.value = 1; name.value = 1; rest.value = 1;
      setReady(true);
      return;
    }
    halo.value = withSpring(1, springs.gentle);
    name.value = withDelay(500, withTiming(1, { duration: 500 }));
    rest.value = withDelay(1000, withTiming(1, { duration: durations.fade * 2 }));
    const id = setTimeout(() => setReady(true), 1500);
    return () => clearTimeout(id);
  }, [halo, name, rest, reduced]);
  const skip = () => {
    halo.value = 1; name.value = 1; rest.value = 1;
    setReady(true);
  };

  const haloStyle = useAnimatedStyle(() => ({ transform: [{ scale: 0.02 + halo.value * 0.98 }], opacity: Math.min(1, halo.value * 1.4) }));
  const nameStyle = useAnimatedStyle(() => ({ opacity: name.value, transform: [{ translateY: (1 - name.value) * 8 }] }));
  const restStyle = useAnimatedStyle(() => ({ opacity: rest.value }));

  const PROPS: { icon: IconName; title: string; sub: string }[] = [
    { icon: 'security', title: t('propNonCustodial'), sub: t('propNonCustodialSub') },
    { icon: 'exchange', title: t('propSwap'), sub: t('propSwapSub') },
    { icon: 'nft', title: t('propTokens'), sub: t('propTokensSub') },
  ];

  return (
    <RNPressable onPress={ready ? undefined : skip} style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, paddingTop: insets.top + space[6], paddingBottom: insets.bottom + space[5], paddingHorizontal: SCREEN_MARGIN }}>
        {/* Naissance du halo */}
        <View style={{ height: 240, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View style={[{ position: 'absolute' }, haloStyle]}>
            <Halo size={360} mood="up" />
          </Animated.View>
          <Animated.View style={[{ alignItems: 'center', gap: space[2] }, nameStyle]}>
            <Text variant="title1" style={{ fontSize: 40, lineHeight: 46, letterSpacing: 2 }}>Kalyx</Text>
            <Text variant="bodySecondary" tone="secondary" style={{ textAlign: 'center', maxWidth: 300 }}>{t('tagline')}</Text>
          </Animated.View>
        </View>

        <Animated.View style={[{ flex: 1, justifyContent: 'center', gap: space[3] }, restStyle]}>
          <Surface padded={false}>
            {PROPS.map((p, i) => (
              <View key={p.title} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4], borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.border }}>
                <View style={{ width: 40, height: 40, borderRadius: radius.round, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={p.icon} size={20} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="body">{p.title}</Text>
                  <Text variant="caption" tone="secondary">{p.sub}</Text>
                </View>
              </View>
            ))}
          </Surface>
        </Animated.View>

        <Animated.View style={[{ gap: space[3] }, restStyle]}>
          <Button label={t('createWalletT')} onPress={() => { newDraft(128); router.push('/backup'); }} />
          <Button label={t('havePhrase')} variant="secondary" onPress={() => router.push('/import')} />
        </Animated.View>
      </View>
    </RNPressable>
  );
}
