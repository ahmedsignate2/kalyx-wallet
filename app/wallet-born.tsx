/**
 * Naissance du wallet (docs/08 §12.1) — le moment signature de la création.
 *
 * Le glyphe de l'adresse se dessine, le halo s'allume derrière, et le texte dit
 * ce que ce motif est. POURQUOI ce moment existe : il transforme le glyphe
 * d'outil anti-hameçonnage en identité affective. C'est ici que l'utilisateur
 * apprend à reconnaître son wallet, donc à repérer plus tard une adresse qui
 * n'est pas la sienne. La beauté sert directement la sécurité.
 *
 * Court, et un tap n'importe où passe : on ne retient personne devant une
 * animation. `?mode=import` affiche « Content de te revoir » pour un wallet
 * retrouvé, afin que l'utilisateur reconnaisse immédiatement ce qu'il récupère.
 */
import React, { useEffect } from 'react';
import { View, Pressable as RNPressable } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { Text, Button, AddressGlyph, Halo } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { space, SCREEN_MARGIN, springs } from '../ui/tokens';
import { useWallet } from '../lib/walletStore';
import { useT } from '../lib/settingsStore';
import { aura } from '../lib/aura';

/** Rythme, en ms : le glyphe d'abord, le sens ensuite. */
const BEAT = { glyph: 120, title: 760, body: 960, action: 1200 } as const;

function Fade({ delay, children, reduced }: { delay: number; children: React.ReactNode; reduced: boolean }) {
  const v = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    v.value = withDelay(delay, withSpring(1, springs.standard));
  }, [delay, reduced, v]);
  const style = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ translateY: (1 - v.value) * 12 }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

export default function WalletBorn() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const t = useT();
  const reduced = useReducedMotion();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const account = useWallet((s) => s.account);
  const halo = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (!reduced) halo.value = withDelay(BEAT.glyph, withSpring(1, springs.gentle));
    // Impulsion de Succès : le wallet existe. L'Aura l'abandonne si le halo
    // n'est pas encore monté, d'où le léger retard.
    const id = setTimeout(() => aura.pulse('success'), BEAT.glyph + 120);
    return () => clearTimeout(id);
  }, [halo, reduced]);

  const haloStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.05 + halo.value * 0.95 }],
    opacity: Math.min(1, halo.value * 1.5),
  }));

  const go = () => router.replace('/home');
  const address = account?.address ?? '';

  return (
    <RNPressable onPress={go} style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SCREEN_MARGIN, gap: space[5] }}>
        <View style={{ alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
          <Animated.View style={[{ position: 'absolute' }, haloStyle]} pointerEvents="none">
            <Halo size={300} mood="up" />
          </Animated.View>
          {address ? <AddressGlyph address={address} size={104} background={false} draw /> : null}
        </View>

        <Fade delay={BEAT.title} reduced={reduced}>
          <Text variant="title1" style={{ textAlign: 'center' }}>
            {mode === 'import' ? t('walletFoundTitle') : t('walletBornTitle')}
          </Text>
        </Fade>
        <Fade delay={BEAT.body} reduced={reduced}>
          <Text variant="bodySecondary" tone="secondary" style={{ textAlign: 'center', maxWidth: 320, lineHeight: 22 }}>
            {t('walletBornBody')}
          </Text>
        </Fade>
      </View>
      <View style={{ paddingHorizontal: SCREEN_MARGIN, paddingBottom: insets.bottom + space[5] }}>
        <Fade delay={BEAT.action} reduced={reduced}>
          <Button label={t('continueToWallet')} onPress={go} />
        </Fade>
      </View>
    </RNPressable>
  );
}
