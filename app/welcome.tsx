/**
 * Bienvenue (§4.9) — le premier contact, et le seul écran orchestré de l'app.
 *
 * C'est aussi l'OUVERTURE de l'app au premier lancement : aucun splash ne le
 * précède (app/_layout.tsx), donc la séquence complète se joue ici, d'un seul
 * tenant, en ~2,2 s. D'abord la cérémonie, seule à l'écran et en grand : le
 * noyau s'allume, les seize rayons en jaillissent un par un au ressort, dans le
 * CIEL de l'accueil (le paysage à l'heure de l'utilisateur) : dès le premier
 * écran, on est dans le monde de Kalyx. Puis, SEULEMENT ensuite, le logo se pose pendant que le
 * nom puis la baseline montent, les trois repères arrivent en décalé, enfin les actions. ~900 ms au total, et
 * surtout NON BLOQUANT : chaque élément est touchable dès qu'il est visible.
 *
 * Consentement : la case reste obligatoire (protection juridique — clause de
 * non-garde, fourniture « en l'état », irréversibilité, cf. lib/legalText.ts),
 * mais les boutons ne sont plus grisés. Toucher « Créer un wallet » sans avoir
 * coché fait trembler la case : on montre ce qui manque au lieu d'offrir un
 * écran mort au tout premier contact.
 */
import { useCallback, useEffect, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming, useReducedMotion } from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';
import { Text, Button, Pressable, Checkbox, Pressable as KPressable } from '../ui/kit';
import { Landscape } from '../ui/Landscape';
import { KalyxLogoIgnite } from '../ui/KalyxLogo';
import { type IconName } from '../ui/icon';
import { useTheme, OnSky } from '../ui/theme';
import { space, SCREEN_MARGIN, fontSize, radii, skyPhaseAt } from '../ui/tokens';
import { useWallet } from '../lib/walletStore';
import { useT } from '../lib/settingsStore';
import { haptic } from '../lib/haptics';
import { isDriveConfigured } from '../lib/googleDrive';
import { IconDisc } from '../ui/nova';

/** Rythme de l'entrée, en millisecondes depuis l'ouverture de l'écran. */
/*
 * Partition de l'ouverture, en millisecondes.
 *
 * L'allumage passe D'ABORD, en grand : 16 rayons qui jaillissent l'un après
 * l'autre (80 + 15 × 32 ≈ 560 ms de cascade, ~950 ms ressorts compris). C'est
 * la cérémonie, et elle doit occuper l'écran seule — un logo de 84 px qui
 * s'allume, personne ne le voit. Il monte donc à ~1,45× le temps de brûler,
 * puis se pose pendant que le nom arrive : le geste sert de transition au lieu
 * d'être suivi d'une coupure.
 */
const IGNITE = { delay: 110, stagger: 44 } as const;
const BEAT = { logo: 0, name: 1180, tagline: 1360, props: 1520, actions: 1860 } as const;
/** Échelle du logo pendant la cérémonie, avant qu'il ne se pose à 1. */
const CEREMONY_SCALE = 1.45;
/** Décalage entre deux arguments (seule cascade autorisée, cf. doctrine §2). */
const STAGGER = 95;

/** Un argument, avec son propre décalage d'entrée. */
function Argument({ icon, title, sub, delay, reduced }: { icon: IconName; title: string; sub: string; delay: number; reduced: boolean }) {
  const v = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) { v.value = 1; return; }
    v.value = withDelay(delay, withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }));
  }, [v, delay, reduced]);
  const style = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ translateY: (1 - v.value) * 14 }] }));
  return (
    <Animated.View style={[{ flexDirection: 'row', alignItems: 'center', gap: space[3] }, style]}>
      <IconDisc name={icon} size={38} />
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
  const { width: winW, height: winH } = useWindowDimensions();
  /** Bas du ciel (mesuré) : la feuille des actions monte dessus. */
  const [heroH, setHeroH] = useState(0);
  const phase = skyPhaseAt(new Date().getHours());
  /*
   * Barre d'état claire sur le ciel, SEULEMENT tant que l'écran est affiché :
   * resté monté sous l'écran suivant, son <StatusBar> (le dernier monté gagne)
   * aurait laissé des icônes blanches sur le Crème.
   */
  const [focused, setFocused] = useState(true);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));

  const t = useT();
  const reduced = useReducedMotion();
  const newDraft = useWallet((s) => s.newDraft);
  const [agreed, setAgreed] = useState(false);
  /** Incrémenté pour faire trembler la case quand on tente d'avancer sans elle. */
  const [nudge, setNudge] = useState(0);

  const logo = useSharedValue(reduced ? 1 : 0);
  /** 1 = le logo a fini de brûler et s'est posé à sa taille définitive. */
  const settle = useSharedValue(reduced ? 1 : 0);
  const name = useSharedValue(reduced ? 1 : 0);
  const tagline = useSharedValue(reduced ? 1 : 0);
  const actions = useSharedValue(reduced ? 1 : 0);
  /** Respiration continue du bouton principal : la seule chose qui appelle au tap. */
  const cta = useSharedValue(1);

  useEffect(() => {
    if (reduced) return;
    /*
     * SANS REBOND. Les ressorts dépassaient leur cible (le logo, le nom, les
     * actions) : à l'écran, tout sautillait. Des courbes qui décélèrent sans
     * dépasser gardent la douceur et retirent le sautillement.
     */
    const calm = (ms: number) => ({ duration: ms, easing: Easing.out(Easing.cubic) });
    logo.value = withDelay(BEAT.logo, withTiming(1, calm(900)));
    // Le logo se pose au moment exact où le nom monte : une seule transition.
    settle.value = withDelay(BEAT.name, withTiming(1, calm(700)));
    name.value = withDelay(BEAT.name, withTiming(1, calm(600)));
    tagline.value = withDelay(BEAT.tagline, withTiming(1, calm(600)));
    actions.value = withDelay(BEAT.actions, withTiming(1, calm(600)));
    // Rainbow fait pulser son CTA en continu (1,02 ↔ 0,98). On garde l'idée
    // mais deux fois plus discrète : à cette échelle on ne la voit pas, on la
    // ressent — et elle ne concurrence pas la respiration du halo.
  }, [logo, settle, name, tagline, actions, cta, reduced]);

  /** Tap n'importe où : on saute la mise en scène (elle ne bloquait déjà rien). */
  const skip = () => { logo.value = 1; settle.value = 1; name.value = 1; tagline.value = 1; actions.value = 1; };

  // La cérémonie : halo ET logo tenus ensemble, en grand, puis posés d'un bloc.
  const ceremonyStyle = useAnimatedStyle(() => ({ transform: [{ scale: CEREMONY_SCALE - settle.value * (CEREMONY_SCALE - 1) }] }));
  // « Punch » emprunté à Rainbow : le bloc dépasse légèrement sa taille finale
  // puis se pose au ressort. C'est ce dépassement qui donne la sensation de
  // matière ; un simple fondu fait plat.
  const nameStyle = useAnimatedStyle(() => ({ opacity: name.value, transform: [{ translateY: (1 - name.value) * 10 }] }));
  const taglineStyle = useAnimatedStyle(() => ({ opacity: tagline.value, transform: [{ translateY: (1 - tagline.value) * 10 }] }));
  const actionsStyle = useAnimatedStyle(() => ({ opacity: actions.value, transform: [{ translateY: (1 - actions.value) * 12 }] }));
  const ctaStyle = useAnimatedStyle(() => ({ transform: [{ scale: cta.value }] }));

  /** Les arguments ne s'affichent que s'il reste la place : les actions passent avant. */
  const showProps = winH >= 760;
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
    <KPressable onPress={skip} noScale haptic="none" accessible={false} style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Le ciel de l'accueil, à l'heure de l'utilisateur ; barre d'état claire dessus. */}
      <Landscape width={winW} height={(heroH || winH * 0.55) + 32} phase={phase} />
      {focused ? <StatusBar style="light" /> : null}
      {/*
        ScrollView + flexGrow:1 : centré quand tout tient, défilant sinon (petit
        écran, texte légal long, langue verbeuse). Une View flex:1 laissait la
        carte déborder par-dessus les boutons, car un enfant ne rétrécit pas par
        défaut dans Yoga, contrairement au web.
      */}
      {/*
        TOUT TIENT SUR L'ÉCRAN, sans défilement : un nouvel utilisateur ne sait
        pas qu'il y a « Importer » ou la restauration Google Drive plus bas.
        Le haut (logo, nom, arguments) prend la place qui reste et se tasse ;
        le bas (consentement et actions) est toujours entièrement visible. Sur
        un petit écran, les arguments cèdent leur place plutôt que les actions.
      */}
      <View style={{ flex: 1, paddingTop: insets.top + space[3], paddingHorizontal: SCREEN_MARGIN }}>
        {/*
          Au tout premier lancement, AUCUN splash ne précède cet écran (cf.
          app/_layout.tsx) : la bienvenue EST l'ouverture de l'app. La cérémonie
          se joue donc ici, en entier — le noyau s'allume, les seize rayons en
          jaillissent un par un au ressort, le halo naît du même point au même
          instant, et le tout redescend à sa taille normale quand le nom monte.
        */}
        <OnSky>
        <View onLayout={(e) => { const h = Math.round(e.nativeEvent.layout.y + e.nativeEvent.layout.height); setHeroH((c) => (c === h ? c : h)); }} style={{ flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center', paddingBottom: space[6] }}>
          <Animated.View style={ceremonyStyle} pointerEvents="none">
            <KalyxLogoIgnite size={84} reduced={reduced} delay={IGNITE.delay} stagger={IGNITE.stagger} alive />
          </Animated.View>
          <Animated.View style={[{ alignItems: 'center', width: '100%', marginTop: space[4] }, nameStyle]}>
            <Text variant="title1" style={{ fontSize: fontSize.h1, lineHeight: 40, letterSpacing: 1.5 }}>Kalyx</Text>
          </Animated.View>
          <Animated.View style={[{ alignItems: 'center', width: '100%' }, taglineStyle]}>
            <Text
              variant="bodySecondary"
              tone="secondary"
              style={{ marginTop: space[2], textAlign: 'center', maxWidth: 300, fontSize: fontSize.base, lineHeight: 22 }}
            >
              {t('tagline')}
            </Text>
          </Animated.View>
        </View>
        </OnSky>

        {/* LA FEUILLE : arguments, consentement et actions, sur le fond du thème, coins arrondis sur le ciel. */}
        <View style={{ marginHorizontal: -SCREEN_MARGIN, paddingHorizontal: SCREEN_MARGIN, paddingTop: space[5], paddingBottom: insets.bottom + space[4], backgroundColor: colors.bg, borderTopLeftRadius: radii.xxl, borderTopRightRadius: radii.xxl }}>

        {/*
          TROIS repères, pas un.
          Le plan (§15.1) demandait de réduire à un seul argument, au motif
          qu'une fonctionnalité se prouve dans l'usage. Essayé, et le verdict sur
          l'écran réel est sans appel : il paraît vide. Un premier écran doit
          donner assez de matière pour qu'on ait envie d'entrer ; réduire à une
          ligne laisse un grand trou sous le logo.

          La cascade reste la seule tolérée par la doctrine §2 : liste courte,
          figée, au premier affichage uniquement — jamais au re-rendu.
        */}
        {showProps ? (
          <View style={{ gap: space[3], marginBottom: space[4], padding: space[3], borderRadius: radii.xl, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.border }}>
            {PROPS.map((p, i) => (
              <Argument key={p.title} {...p} delay={BEAT.props + i * STAGGER} reduced={reduced} />
            ))}
          </View>
        ) : null}

        <Animated.View style={[{ gap: space[3] }, actionsStyle]}>
          <Checkbox
            checked={agreed}
            onChange={setAgreed}
            shake={nudge}
            label={<Text variant="caption" tone="secondary" style={{ lineHeight: 18 }}>{t('legalConsentLabel')}</Text>}
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space[4], rowGap: space[1], marginLeft: 34 }}>
            <Pressable onPress={() => router.push({ pathname: '/legal', params: { doc: 'terms' } })} noScale hitSlop={8}>
              <Text variant="caption" style={{ color: colors.primary, textDecorationLine: 'underline' }}>{t('legalTermsOfService')}</Text>
            </Pressable>
            <Pressable onPress={() => router.push({ pathname: '/legal', params: { doc: 'privacy' } })} noScale hitSlop={8}>
              <Text variant="caption" style={{ color: colors.primary, textDecorationLine: 'underline' }}>{t('legalPrivacyPolicy')}</Text>
            </Pressable>
          </View>

          <Animated.View style={ctaStyle}>
            <Button label={t('createWalletT')} onPress={guarded(() => { newDraft(128); router.push('/backup'); })} sheen style={{ marginTop: space[1] }} />
          </Animated.View>
          <Button label={t('havePhrase')} variant="secondary" onPress={guarded(() => router.push('/import'))} />
          {isDriveConfigured() ? (
            <Pressable onPress={guarded(() => router.push('/restore-drive'))} noScale hitSlop={8} style={{ alignItems: 'center', paddingVertical: space[2] }}>
              <Text variant="caption" style={{ color: colors.textSecondary }}>{t('driveRestore')}</Text>
            </Pressable>
          ) : null}
        </Animated.View>
        </View>
      </View>
    </KPressable>
  );
}
