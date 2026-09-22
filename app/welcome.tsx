/**
 * Bienvenue (§4.9) — le premier contact, et le seul écran orchestré de l'app.
 *
 * C'est aussi l'OUVERTURE de l'app au premier lancement : aucun splash ne le
 * précède (app/_layout.tsx), donc la séquence complète se joue ici, d'un seul
 * tenant, en ~1,25 s — le logo s'allume et le halo naît du même point au même
 * instant, le nom puis la baseline montent, les trois arguments
 * arrivent en décalé (seule cascade autorisée : liste courte et figée, au
 * premier affichage uniquement), enfin les actions. ~900 ms au total, et
 * surtout NON BLOQUANT : chaque élément est touchable dès qu'il est visible.
 *
 * Consentement : la case reste obligatoire (protection juridique — clause de
 * non-garde, fourniture « en l'état », irréversibilité, cf. lib/legalText.ts),
 * mais les boutons ne sont plus grisés. Toucher « Créer un wallet » sans avoir
 * coché fait trembler la case : on montre ce qui manque au lieu d'offrir un
 * écran mort au tout premier contact.
 */
import React, { useEffect, useState } from 'react';
import { View, ScrollView, Pressable as RNPressable } from 'react-native';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSpring, withTiming, useReducedMotion } from 'react-native-reanimated';
import { Text, Button, Halo, Pressable, Checkbox } from '../ui/kit';
import { KalyxLogoIgnite } from '../ui/KalyxLogo';
import { Icon, type IconName } from '../ui/icon';
import { useTheme } from '../ui/theme';
import { space, SCREEN_MARGIN, springs, radius } from '../ui/tokens';
import { useWallet } from '../lib/walletStore';
import { useT } from '../lib/settingsStore';
import { haptic } from '../lib/haptics';
import { isDriveConfigured } from '../lib/googleDrive';

/** Rythme de l'entrée, en millisecondes depuis l'ouverture de l'écran. */
const BEAT = { logo: 0, name: 300, tagline: 440, props: 580, actions: 880 } as const;
/** Décalage entre deux arguments (seule cascade autorisée, cf. doctrine §2). */
const STAGGER = 80;

/** Un argument, avec son propre décalage d'entrée. */
function Argument({ icon, title, sub, delay, reduced }: { icon: IconName; title: string; sub: string; delay: number; reduced: boolean }) {
  const { colors } = useTheme();
  const v = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) { v.value = 1; return; }
    v.value = withDelay(delay, withSpring(1, springs.standard));
  }, [v, delay, reduced]);
  const style = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ translateY: (1 - v.value) * 14 }] }));
  return (
    <Animated.View style={[{ flexDirection: 'row', alignItems: 'center', gap: space[3] }, style]}>
      <View style={{ width: 38, height: 38, borderRadius: radius.round, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={19} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body">{title}</Text>
        <Text variant="caption" tone="secondary" style={{ lineHeight: 18 }}>{sub}</Text>
      </View>
    </Animated.View>
  );
}

export default function Welcome() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const t = useT();
  const reduced = useReducedMotion();
  const newDraft = useWallet((s) => s.newDraft);
  const [agreed, setAgreed] = useState(false);
  /** Incrémenté pour faire trembler la case quand on tente d'avancer sans elle. */
  const [nudge, setNudge] = useState(0);

  const logo = useSharedValue(reduced ? 1 : 0);
  const name = useSharedValue(reduced ? 1 : 0);
  const tagline = useSharedValue(reduced ? 1 : 0);
  const actions = useSharedValue(reduced ? 1 : 0);
  /** Respiration continue du bouton principal : la seule chose qui appelle au tap. */
  const cta = useSharedValue(1);

  useEffect(() => {
    if (reduced) return;
    logo.value = withDelay(BEAT.logo, withSpring(1, springs.gentle));
    name.value = withDelay(BEAT.name, withSpring(1, springs.standard));
    tagline.value = withDelay(BEAT.tagline, withSpring(1, springs.standard));
    actions.value = withDelay(BEAT.actions, withSpring(1, springs.standard));
    // Rainbow fait pulser son CTA en continu (1,02 ↔ 0,98). On garde l'idée
    // mais deux fois plus discrète : à cette échelle on ne la voit pas, on la
    // ressent — et elle ne concurrence pas la respiration du halo.
    cta.value = withDelay(BEAT.actions + 400, withRepeat(withTiming(1.012, { duration: 1400, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [logo, name, tagline, actions, cta, reduced]);

  /** Tap n'importe où : on saute la mise en scène (elle ne bloquait déjà rien). */
  const skip = () => { logo.value = 1; name.value = 1; tagline.value = 1; actions.value = 1; };

  // Le halo s'ouvre d'un point ; le logo apparaît dedans, légèrement en retard.
  const haloStyle = useAnimatedStyle(() => ({ transform: [{ scale: 0.04 + logo.value * 0.96 }], opacity: Math.min(1, logo.value * 1.5) }));
  // « Punch » emprunté à Rainbow : le bloc dépasse légèrement sa taille finale
  // puis se pose au ressort. C'est ce dépassement qui donne la sensation de
  // matière ; un simple fondu fait plat.
  const logoStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, logo.value * 1.6), transform: [{ scale: 0.82 + logo.value * 0.18 }] }));
  const nameStyle = useAnimatedStyle(() => ({ opacity: name.value, transform: [{ translateY: (1 - name.value) * 10 }, { scale: 0.96 + name.value * 0.04 }] }));
  const taglineStyle = useAnimatedStyle(() => ({ opacity: tagline.value, transform: [{ translateY: (1 - tagline.value) * 10 }] }));
  const actionsStyle = useAnimatedStyle(() => ({ opacity: actions.value, transform: [{ translateY: (1 - actions.value) * 12 }] }));
  const ctaStyle = useAnimatedStyle(() => ({ transform: [{ scale: cta.value }] }));

  const PROPS: { icon: IconName; title: string; sub: string }[] = [
    { icon: 'security', title: t('propNonCustodial'), sub: t('propNonCustodialSub') },
    { icon: 'exchange', title: t('propSwap'), sub: t('propSwapSub') },
    { icon: 'nft', title: t('propTokens'), sub: t('propTokensSub') },
  ];

  /** Garde le consentement obligatoire, sans jamais présenter un bouton mort. */
  const guarded = (go: () => void) => () => {
    if (!agreed) { haptic.warning(); setNudge((n) => n + 1); return; }
    go();
  };

  return (
    <RNPressable onPress={skip} style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      {/*
        ScrollView + flexGrow:1 : centré quand tout tient, défilant sinon (petit
        écran, texte légal long, langue verbeuse). Une View flex:1 laissait la
        carte déborder par-dessus les boutons, car un enfant ne rétrécit pas par
        défaut dans Yoga, contrairement au web.
      */}
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + space[5], paddingBottom: insets.bottom + space[5], paddingHorizontal: SCREEN_MARGIN }}
        showsVerticalScrollIndicator={false}
      >
        {/* Naissance du halo + logo : le moment de marque. */}
        {/*
          Au tout premier lancement, AUCUN splash n'a précédé cet écran (cf.
          app/_layout.tsx) : la bienvenue EST l'ouverture de l'app. Le logo
          s'allume donc ici, et le halo naît du même point au même instant.
        */}
        <View style={{ minHeight: 230, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View style={[{ position: 'absolute' }, haloStyle]} pointerEvents="none">
            <Halo size={340} mood="up" />
          </Animated.View>
          <Animated.View style={logoStyle}>
            <KalyxLogoIgnite size={84} reduced={reduced} delay={60} duration={620} />
          </Animated.View>
          <Animated.View style={[{ alignItems: 'center', width: '100%', marginTop: space[4] }, nameStyle]}>
            <Text variant="title1" style={{ fontSize: 38, lineHeight: 44, letterSpacing: 1.5 }}>Kalyx</Text>
          </Animated.View>
          <Animated.View style={[{ alignItems: 'center', width: '100%' }, taglineStyle]}>
            <Text
              variant="bodySecondary"
              tone="secondary"
              style={{ marginTop: space[3], textAlign: 'center', maxWidth: 300, fontSize: 15, lineHeight: 23 }}
            >
              {t('tagline')}
            </Text>
          </Animated.View>
        </View>

        {/* Arguments : plus de carte bordée — de l'air, et une entrée décalée. */}
        <View style={{ gap: space[4], marginVertical: space[6] }}>
          {PROPS.map((p, i) => (
            <Argument key={p.title} {...p} delay={BEAT.props + i * STAGGER} reduced={reduced} />
          ))}
        </View>

        <Animated.View style={[{ gap: space[3] }, actionsStyle]}>
          <Checkbox
            checked={agreed}
            onChange={setAgreed}
            shake={nudge}
            label={<Text variant="caption" tone="secondary" style={{ lineHeight: 18 }}>{t('legalConsentLabel')}</Text>}
          />
          <View style={{ flexDirection: 'row', gap: space[4], marginLeft: 34 }}>
            <Pressable onPress={() => router.push({ pathname: '/legal', params: { doc: 'terms' } })} noScale hitSlop={8}>
              <Text variant="caption" style={{ color: colors.primary, textDecorationLine: 'underline' }}>{t('legalTermsOfService')}</Text>
            </Pressable>
            <Pressable onPress={() => router.push({ pathname: '/legal', params: { doc: 'privacy' } })} noScale hitSlop={8}>
              <Text variant="caption" style={{ color: colors.primary, textDecorationLine: 'underline' }}>{t('legalPrivacyPolicy')}</Text>
            </Pressable>
          </View>

          <Animated.View style={ctaStyle}>
            <Button label={t('createWalletT')} onPress={guarded(() => { newDraft(128); router.push('/backup'); })} style={{ marginTop: space[2] }} />
          </Animated.View>
          <Button label={t('havePhrase')} variant="secondary" onPress={guarded(() => router.push('/import'))} />
          {isDriveConfigured() ? (
            <Pressable onPress={guarded(() => router.push('/restore-drive'))} noScale hitSlop={8} style={{ alignItems: 'center', paddingVertical: space[2] }}>
              <Text variant="caption" style={{ color: colors.textSecondary }}>{t('driveRestore')}</Text>
            </Pressable>
          ) : null}
        </Animated.View>
      </ScrollView>
    </RNPressable>
  );
}
