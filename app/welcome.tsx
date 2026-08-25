import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Easing, StyleSheet } from 'react-native';
import { router, Stack } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../ui/components';
import { ShineLogo } from '../ui/ShineLogo';
import { AuroraBackground } from '../ui/AuroraBackground';
import { Icon, type IconName } from '../ui/icon';
import { fonts, spacing, useTheme } from '../ui/theme';
import { useWallet } from '../lib/walletStore';
import { useT } from '../lib/settingsStore';

/** Petit bloc qui apparaît en fondu+montée avec un délai (effet staggeré). */
function Reveal({ delay, children, style }: { delay: number; children: React.ReactNode; style?: object }) {
  const op = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(16)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(op, { toValue: 1, duration: 420, delay, useNativeDriver: true }),
      Animated.timing(y, { toValue: 0, duration: 460, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [op, y, delay]);
  return <Animated.View style={[{ opacity: op, transform: [{ translateY: y }] }, style]}>{children}</Animated.View>;
}

export default function Welcome() {
  const { colors, gradients } = useTheme();
  const insets = useSafeAreaInsets();
  const t = useT();
  const newDraft = useWallet((s) => s.newDraft);
  const PROPS: { icon: IconName; title: string; sub: string }[] = [
    { icon: 'security', title: t('propNonCustodial'), sub: t('propNonCustodialSub') },
    { icon: 'exchange', title: t('propSwap'), sub: t('propSwapSub') },
    { icon: 'nft', title: t('propTokens'), sub: t('propTokensSub') },
  ];

  const onCreate = () => {
    newDraft(128); // 12 mots
    router.push('/backup');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgDeep }}>
      {/* Écran plein écran : pas de barre d'en-tête vide (comme home/menu/…). */}
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient colors={gradients.screen} style={StyleSheet.absoluteFill} />
      <AuroraBackground intensity={0.4} />
      <View style={{ flex: 1, paddingTop: insets.top + spacing(2.5), paddingBottom: insets.bottom + spacing(2), paddingHorizontal: spacing(3) }}>
        {/* Marque */}
        <View style={{ alignItems: 'center', gap: spacing(1.5) }}>
          <ShineLogo size={88} />
          <Reveal delay={220}>
            <Text style={{ color: colors.text, fontSize: 40, fontFamily: fonts.brandStrong, letterSpacing: 3, textAlign: 'center', textShadowColor: colors.accent, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 16 }}>Nova</Text>
          </Reveal>
          <Reveal delay={300}>
            <Text style={{ color: colors.textMuted, fontSize: 16, textAlign: 'center', maxWidth: 300 }}>
              {t('tagline')}
            </Text>
          </Reveal>
        </View>

        {/* Arguments */}
        <View style={{ flex: 1, justifyContent: 'center', gap: spacing(1.5), marginTop: spacing(2) }}>
          {PROPS.map((p, i) => (
            <Reveal key={p.title} delay={420 + i * 110}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.75), backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: 20, padding: spacing(1.75) }}>
                <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.glassStrong, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={p.icon} size={22} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 16, fontFamily: fonts.semibold }}>{p.title}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 1 }}>{p.sub}</Text>
                </View>
              </View>
            </Reveal>
          ))}
        </View>

        {/* Actions */}
        <Reveal delay={800} style={{ gap: spacing(1.5) }}>
          <Button label={t('createWalletT')} onPress={onCreate} />
          <Button label={t('havePhrase')} variant="ghost" onPress={() => router.push('/import')} />
        </Reveal>
      </View>
    </View>
  );
}
