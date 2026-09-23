/**
 * Affiche le bandeau courant : entrée par le haut sous la safe area, sortie en
 * fondu, tap pour fermer. Monté une fois dans _layout, au-dessus de tout.
 *
 * Corrections apportées à l'étape 2 (docs/08 §12.2, §18, §5) :
 *
 *  - PLUS D'OMBRE. Il portait `shadowOpacity: 0.28` et `elevation: 10`, interdits
 *    par le §18 : la séparation vient du contraste de la surface, pas d'un flou.
 *  - PLUS DE `Vibration.vibrate()`. C'était un appel natif brut qui ignorait le
 *    réglage haptique de l'utilisateur et sortait de la grammaire du §5. On
 *    passe par `lib/haptics`, avec l'intention juste : Success pour une
 *    réussite, Error pour un échec, Warning pour une alerte, rien pour une info
 *    — une information n'a pas à se faire sentir.
 *  - DURÉE PROPORTIONNELLE au texte, et jamais plus courte que le temps de
 *    lecture. Un « Adresse copiée » et un message de deux lignes restaient
 *    affichés aussi longtemps l'un que l'autre.
 *  - SURFACE NEUTRE avec un simple POINT de lumière à gauche, en écho à l'Aura.
 *    La barre colorée de 4 px et le disque teinté de 34 px faisaient du type du
 *    message l'élément le plus visible du bandeau, avant son contenu.
 *  - ANNONCÉ AU LECTEUR D'ÉCRAN : `accessibilityLiveRegion` sur Android, et
 *    annonce explicite sur iOS, qui ne lit pas les régions vivantes.
 *
 * RESTE À FAIRE : « glisser vers le haut pour fermer » (§12.2). Le geste demande
 * `react-native-gesture-handler`, qui est bien en dépendance mais n'est importé
 * NULLE PART — il faudrait poser un `GestureHandlerRootView` à la racine de
 * l'app. C'est une adoption structurelle, pas un détail de bandeau, et le §9
 * (home morphing) en aura besoin de toute façon : à décider là.
 */
import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Platform, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from './icon';
import { Text, Pressable } from './kit';
import { useTheme } from './theme';
import { radius, space, springs, durations } from './tokens';
import { haptic } from '../lib/haptics';
import { useToastStore, type ToastType } from '../lib/toast';

/** Intention haptique par type (§5). `null` = silence : une info ne vibre pas. */
const CONF: Record<ToastType, { icon: IconName; tone: 'up' | 'danger' | 'primary' | 'warning'; feel: (() => void) | null }> = {
  success: { icon: 'check', tone: 'up', feel: () => haptic.success() },
  error: { icon: 'warning', tone: 'danger', feel: () => haptic.error() },
  info: { icon: 'info', tone: 'primary', feel: null },
  warning: { icon: 'warning', tone: 'warning', feel: () => haptic.warning() },
};

/*
 * Temps de lecture. ~18 caractères par seconde est une vitesse de COUP D'ŒIL,
 * pas de lecture attentive : le bandeau est lu en passant. Les bornes évitent
 * qu'un texte très court disparaisse avant d'être vu, et qu'un texte long
 * squatte l'écran. À calibrer sur device (§19 rejette les constantes posées sur
 * le papier) — elles sont ici pour être corrigées.
 */
const CHARS_PER_SEC = 18;
const MIN_MS = 2600;
const MAX_MS = 7000;

function readingTime(t: { title: string; message?: string }): number {
  const chars = t.title.length + (t.message?.length ?? 0);
  return Math.min(MAX_MS, Math.max(MIN_MS, (chars / CHARS_PER_SEC) * 1000));
}

export function ToastHost() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const current = useToastStore((s) => s.current);
  const hide = useToastStore((s) => s.hide);

  const v = useSharedValue(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!current) return;
    const conf = CONF[current.type];
    conf.feel?.();

    // iOS ne lit pas accessibilityLiveRegion : on annonce explicitement.
    const spoken = current.message ? `${current.title}. ${current.message}` : current.title;
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(spoken);

    v.value = reduced ? withTiming(1, { duration: durations.fade }) : withSpring(1, springs.standard);

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      v.value = withTiming(0, { duration: durations.fade });
      // On laisse la sortie se jouer avant de céder la place au suivant.
      setTimeout(hide, durations.fade);
    }, readingTime(current));

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // `current.id` : un nouveau bandeau rejoue, un simple re-rendu non.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, reduced]);

  const dismiss = () => {
    if (timer.current) clearTimeout(timer.current);
    v.value = withTiming(0, { duration: durations.fade });
    setTimeout(hide, durations.fade);
  };

  const style = useAnimatedStyle(() => ({
    opacity: v.value,
    transform: [{ translateY: (1 - v.value) * -24 }],
  }));

  if (!current) return null;
  const conf = CONF[current.type];
  const accent = colors[conf.tone];

  return (
    <Animated.View
      pointerEvents="box-none"
      accessibilityLiveRegion="polite"
      style={[
        { position: 'absolute', top: insets.top + space[2], left: space[4], right: space[4], zIndex: 200 },
        style,
      ]}
    >
      <Pressable onPress={dismiss} noScale haptic="none" accessibilityRole="alert">
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[3],
            backgroundColor: colors.surface2,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.container,
            paddingVertical: space[3],
            paddingHorizontal: space[4],
          }}
        >
          {/* Point de lumière : il DIT le type sans le crier (§12.2). */}
          <View style={{ width: 8, height: 8, borderRadius: radius.round, backgroundColor: accent }} />
          <Icon name={conf.icon} size={18} color={colors.textSecondary} />
          <View style={{ flex: 1 }}>
            <Text variant="body" numberOfLines={1}>{current.title}</Text>
            {current.message ? (
              <Text variant="caption" tone="secondary" numberOfLines={2} style={{ marginTop: 1 }}>
                {current.message}
              </Text>
            ) : null}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}
