/**
 * Bienvenue (§4.9) — LE seul moment orchestré de l'app : le halo naît d'un
 * point et s'ouvre (ressort Doux), le nom apparaît. 1,5 s max, passable d'un
 * tap. Puis « Créer un wallet » / « J'ai déjà un wallet ».
 * « Réduire les animations » : tout est visible immédiatement.
 */
import React, { useEffect, useState } from 'react';
import { View, ScrollView, Pressable as RNPressable } from 'react-native';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming, useReducedMotion } from 'react-native-reanimated';
import { Text, Button, Halo, Surface, Pressable } from '../ui/kit';
import { Icon, type IconName } from '../ui/icon';
import { useTheme } from '../ui/theme';
import { space, SCREEN_MARGIN, springs, durations, radius } from '../ui/tokens';
import { useWallet } from '../lib/walletStore';
import { useT } from '../lib/settingsStore';
import { isDriveConfigured } from '../lib/googleDrive';

export default function Welcome() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const t = useT();
  const reduced = useReducedMotion();
  const newDraft = useWallet((s) => s.newDraft);
  const [ready, setReady] = useState(false);
  // Acceptation explicite des CGU/Politique de confidentialité, requise avant
  // de créer/importer un wallet — protection juridique (clause de non-garde,
  // fourniture « en l'état », irréversibilité) : voir lib/legalText.ts.
  const [agreed, setAgreed] = useState(false);

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
      {/*
        ScrollView plutôt qu'une simple View flex:1 : la carte des arguments
        (flex:1 pour se centrer verticalement) a un enfant (Surface) qui, lui,
        NE rétrécit PAS (flexShrink par défaut = 0 dans Yoga/RN, contrairement
        au web). Sur un écran bas ou dès que le contenu du dessous s'allonge
        (ex. le bloc CGU), la carte peut donc déborder par-dessus les boutons
        au lieu de rétrécir — d'où le chevauchement. Le ScrollView + flexGrow:1
        garde le rendu centré quand tout tient, et fait défiler proprement sinon.
      */}
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + space[6], paddingBottom: insets.bottom + space[5], paddingHorizontal: SCREEN_MARGIN }}
        showsVerticalScrollIndicator={false}
      >
        {/* Naissance du halo */}
        {/* En-tête : hauteur libre (le sous-titre peut prendre 2 lignes), halo derrière le nom seulement. */}
        <View style={{ minHeight: 280, alignItems: 'center', justifyContent: 'center', paddingVertical: space[6] }}>
          <Animated.View style={[{ position: 'absolute', top: -60 }, haloStyle]} pointerEvents="none">
            <Halo size={320} mood="up" />
          </Animated.View>
          <Animated.View style={[{ alignItems: 'center', width: '100%', paddingHorizontal: space[6] }, nameStyle]}>
            <Text variant="title1" style={{ fontSize: 40, lineHeight: 48, letterSpacing: 2, textAlign: 'center' }}>Kalyx</Text>
            <Text
              variant="bodySecondary"
              tone="secondary"
              style={{ marginTop: space[4], textAlign: 'center', width: '100%', maxWidth: 300, fontSize: 15, lineHeight: 23, letterSpacing: 0.2 }}
            >
              {t('tagline')}
            </Text>
          </Animated.View>
        </View>

        <Animated.View style={[{ flex: 1, justifyContent: 'center', gap: space[3], marginTop: space[2] }, restStyle]}>
          <Surface padded={false}>
            {PROPS.map((p, i) => (
              <View key={p.title} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4], borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.border }}>
                <View style={{ width: 40, height: 40, borderRadius: radius.round, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={p.icon} size={20} />
                </View>
                <View style={{ flex: 1, gap: space[1] }}>
                  <Text variant="body">{p.title}</Text>
                  <Text variant="caption" tone="secondary" style={{ lineHeight: 18 }}>{p.sub}</Text>
                </View>
              </View>
            ))}
          </Surface>
        </Animated.View>

        <Animated.View style={[{ gap: space[3] }, restStyle]}>
          <Pressable
            onPress={() => setAgreed((v) => !v)}
            style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[2] }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreed }}
          >
            <Text style={{ fontSize: 18, lineHeight: 20, color: agreed ? colors.primary : colors.textSecondary }}>{agreed ? '☑' : '☐'}</Text>
            <Text variant="caption" tone="secondary" style={{ flex: 1, lineHeight: 18 }}>{t('legalConsentLabel')}</Text>
          </Pressable>
          <View style={{ flexDirection: 'row', gap: space[4], marginTop: -space[2] }}>
            <Pressable onPress={() => router.push({ pathname: '/legal', params: { doc: 'terms' } })}>
              <Text variant="caption" style={{ color: colors.primary, textDecorationLine: 'underline' }}>{t('legalTermsOfService')}</Text>
            </Pressable>
            <Pressable onPress={() => router.push({ pathname: '/legal', params: { doc: 'privacy' } })}>
              <Text variant="caption" style={{ color: colors.primary, textDecorationLine: 'underline' }}>{t('legalPrivacyPolicy')}</Text>
            </Pressable>
          </View>
          <Button label={t('createWalletT')} disabled={!agreed} onPress={() => { newDraft(128); router.push('/backup'); }} />
          <Button label={t('havePhrase')} variant="secondary" disabled={!agreed} onPress={() => router.push('/import')} />
          {isDriveConfigured() ? <Button label={t('driveRestore')} variant="secondary" disabled={!agreed} onPress={() => router.push('/restore-drive')} /> : null}
        </Animated.View>
      </ScrollView>
    </RNPressable>
  );
}
