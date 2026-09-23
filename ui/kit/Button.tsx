/**
 * Button Kalyx — 4 variantes (§9) : principal (Lumière, h 56, rayon 18),
 * secondaire (Orbite, rayon 12), discret (texte seul), destructif.
 * États : normal, pressé (scale), désactivé, chargement. Zéro dégradé, zéro ombre.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { Pressable } from './Pressable';
import { Text } from './Text';
import { Icon, type IconName } from '../icon';
import { useTheme } from '../theme';
import { radius, BUTTON_HEIGHT, space, springs, durations } from '../tokens';
import { haptic } from '../../lib/haptics';

const AnimatedPath = Animated.createAnimatedComponent(Path);
/** Même tracé que la case à cocher : une seule coche dans toute l'app. */
const CHECK = 'M4 8.5 L7 11.5 L12.5 5';
const CHECK_LEN = 16;

/** Coche dessinée à la réussite (§6.2) — l'indicateur se transforme, il ne saute pas. */
function SuccessCheck({ color, size = 22 }: { color: string; size?: number }) {
  const v = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    v.value = reduced ? withTiming(1, { duration: durations.fade }) : withSpring(1, springs.bouncy);
  }, [v, reduced]);
  const props = useAnimatedProps(() => ({ strokeDashoffset: CHECK_LEN * (1 - v.value) }));
  return (
    <Svg width={size} height={size} viewBox="0 0 17 17">
      <AnimatedPath
        d={CHECK}
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        strokeDasharray={CHECK_LEN}
        animatedProps={props}
      />
    </Svg>
  );
}

/**
 * Micro-texte de l'état « pas encore » (§6.2). Un bouton grisé et muet
 * frustre : l'utilisateur ne sait pas s'il a mal visé, si l'app est cassée, ou
 * ce qu'il lui manque. Celui-ci reste tapable et RÉPOND.
 */
function NotYetHint({ text, seq }: { text: string; seq: number }) {
  const { colors } = useTheme();
  const v = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!seq) return;
    // UNE seule séquence : deux affectations successives écraseraient la
    // première, et le texte n'apparaîtrait jamais.
    v.value = withSequence(
      reduced ? withTiming(1, { duration: durations.fade }) : withSpring(1, springs.standard),
      // Assez long pour être lu sans relecture, assez court pour ne pas rester.
      withDelay(3200, withTiming(0, { duration: durations.fade })),
    );
  }, [seq, v, reduced]);
  const style = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ translateY: (1 - v.value) * -4 }] }));
  return (
    <Animated.View style={[{ marginTop: space[2] }, style]} pointerEvents="none">
      <Text variant="caption" tone="secondary" style={{ textAlign: 'center' }}>{text}</Text>
    </Animated.View>
  );
}

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';

/** Durée d'un cycle de brillance : un éclat court, puis une longue attente. */
const SHEEN_CYCLE = 3800;
const SHEEN_TRAVEL = 0.28; // part du cycle pendant laquelle la bande traverse
const SHEEN_BAND = 110;

/**
 * Reflet qui traverse le bouton, comme la lumière sur du métal poli. Réservé à
 * l'action principale d'un écran d'accueil ou d'accroche : sur une pile de
 * boutons ordinaires, ça devient une guirlande.
 *
 * La bande est teintée en `onPrimary` (donc sombre sur un bouton clair, claire
 * sur un bouton sombre) : un reflet blanc serait invisible sur le bouton
 * Lumière du thème sombre.
 */
function Sheen({ color, radius: r }: { color: string; radius: number }) {
  const reduced = useReducedMotion();
  const [w, setW] = useState(0);
  const t = useSharedValue(0);

  useEffect(() => {
    if (reduced || !w) return;
    t.value = withRepeat(withTiming(1, { duration: SHEEN_CYCLE, easing: Easing.linear }), -1, false);
  }, [t, reduced, w]);

  const style = useAnimatedStyle(() => {
    const p = t.value / SHEEN_TRAVEL;
    if (p > 1) return { opacity: 0 };
    return {
      opacity: 0.16,
      transform: [{ translateX: -SHEEN_BAND + p * (w + SHEEN_BAND * 2) }, { rotate: '16deg' }],
    };
  });

  return (
    <View
      pointerEvents="none"
      onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: r, overflow: 'hidden' }}
    >
      <Animated.View style={[{ position: 'absolute', top: -20, bottom: -20, width: SHEEN_BAND }, style]}>
        <LinearGradient colors={['transparent', color, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
      </Animated.View>
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading,
  success,
  disabled,
  notYet,
  notYetHint,
  size = 'lg',
  dense,
  sheen,
  style,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  loading?: boolean;
  /** Réussite : l'indicateur devient une coche, puis l'écran navigue (§6.2). */
  success?: boolean;
  /** Action INTERDITE (formulaire invalide) : aucune réaction à la pression. */
  disabled?: boolean;
  /**
   * Action impossible DANS CE CONTEXTE (Envoyer avec un solde nul). Contraste
   * réduit, mais le bouton reste tapable et explique — un bouton muet frustre,
   * un bouton qui répond rassure (§6.2).
   */
  notYet?: boolean;
  /** Ce que dit le bouton quand on le tape en état « pas encore ». */
  notYetHint?: string;
  size?: 'lg' | 'md' | 'sm';
  /** Rangée serrée (3 boutons) : libellé 13 pt, padding réduit — jamais de troncature. */
  dense?: boolean;
  /** Reflet qui traverse en boucle. UNE seule fois par écran, sur l'action principale. */
  sheen?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const [hintSeq, setHintSeq] = useState(0);
  const off = disabled || loading || success;
  /** Occupé : la forme ne change pas, seul son contenu est remplacé. */
  const busy = loading || success;
  const height = size === 'lg' ? BUTTON_HEIGHT : size === 'md' ? 44 : 36;
  const r = size === 'lg' ? radius.button : radius.input;

  const bg =
    variant === 'primary' ? colors.primary
    : variant === 'secondary' ? colors.surface2
    : variant === 'destructive' ? colors.danger
    : 'transparent';
  const fg = variant === 'primary' ? colors.onPrimary : variant === 'destructive' ? '#FFFFFF' : colors.text;

  const button = (
    <Pressable
      onPress={notYet ? () => { haptic.warning(); setHintSeq((n) => n + 1); } : onPress}
      disabled={off}
      // Dépassement au relâchement : la sensation de matière (§6.2). Pas sur
      // les variantes discrètes, qui sont du texte.
      overshoot={variant === 'primary' || variant === 'secondary'}
      // On ACTIONNE un bouton, on ne le choisit pas (§5).
      haptic="light"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      accessibilityHint={notYet ? notYetHint : undefined}
      style={[
        {
          height,
          borderRadius: r,
          backgroundColor: bg,
          paddingHorizontal: size === 'sm' || dense ? space[3] : space[5],
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space[2],
          // « Interdit » s'efface ; « pas encore » reste lisible, car il invite
          // à être tapé pour obtenir son explication.
          opacity: disabled ? 0.4 : notYet ? 0.55 : 1,
          borderWidth: variant === 'secondary' ? 1 : 0,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      {sheen && !off ? <Sheen color={fg} radius={r} /> : null}
      {/*
        Le libellé reste TOUJOURS monté, seulement rendu invisible pendant le
        chargement : c'est lui qui fixe la largeur du bouton. Le remplacer par un
        indicateur, comme avant, faisait rétrécir le bouton au moment précis où
        l'utilisateur attend — le contraire de ce qu'on veut lui montrer (§6.2).
      */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], opacity: busy ? 0 : 1 }}>
        {icon ? <Icon name={icon} size={size === 'sm' || dense ? 16 : 20} color={fg} /> : null}
        <Text variant={size === 'sm' || dense ? 'caption' : 'body'} style={{ color: fg }} numberOfLines={1}>{label}</Text>
      </View>
      {busy ? (
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          {success ? <SuccessCheck color={fg} size={size === 'sm' || dense ? 18 : 22} /> : <ActivityIndicator color={fg} />}
        </View>
      ) : null}
      {/* Zone tactile ≥ 48 même en taille sm */}
      {height < 48 ? <View style={{ position: 'absolute', top: -(48 - height) / 2, bottom: -(48 - height) / 2, left: 0, right: 0 }} pointerEvents="none" /> : null}
    </Pressable>
  );

  // Pas de micro-texte demandé → on rend le bouton NU. Envelopper tout le monde
  // dans une View ajouterait un niveau de mise en page à chaque bouton de l'app,
  // pour une fonctionnalité que presque aucun n'utilise.
  if (!notYetHint) return button;
  return (
    <View style={{ width: '100%' }}>
      {button}
      <NotYetHint text={notYetHint} seq={hintSeq} />
    </View>
  );
}

/** Bouton icône rond (48 × 48, zone tactile minimale §2.6). */
export function IconButton({ icon, onPress, label, tone = 'surface', disabled }: { icon: IconName; onPress?: () => void; /** Label lecteur d'écran — obligatoire (§8). */ label: string; tone?: 'surface' | 'ghost' | 'primary'; disabled?: boolean }) {
  const { colors } = useTheme();
  const bg = tone === 'primary' ? colors.primary : tone === 'surface' ? colors.surface2 : 'transparent';
  const fg = tone === 'primary' ? colors.onPrimary : colors.text;
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityLabel={label} style={{ width: 48, height: 48, borderRadius: radius.round, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1 }}>
      <Icon name={icon} size={22} color={fg} />
    </Pressable>
  );
}
