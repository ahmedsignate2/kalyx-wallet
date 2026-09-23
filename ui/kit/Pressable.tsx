/**
 * Pressable Kalyx — base de tous les composants tactiles du kit.
 *
 * Appui = scale 0.96 avec le ressort « Vif », JAMAIS de changement d'opacité
 * (§3.2). Respecte « Réduire les animations » : le scale devient un fondu.
 *
 * RELÂCHEMENT (docs/08 §6.2) : `overshoot` fait dépasser légèrement le doigt
 * parti — le bouton revient à 1,014 avant de se poser. C'est ce dépassement qui
 * donne la sensation de MATIÈRE : sans lui on sent « j'ai cliqué », avec lui on
 * sent « quelque chose a répondu ». Réservé aux boutons ; une ligne de liste qui
 * rebondit fait sauter la liste entière.
 *
 * HAPTIQUE (§5) : la grammaire distingue deux intentions, et le composant doit
 * la déclarer plutôt que la subir.
 *  - `light`     → on ACTIONNE quelque chose (boutons).
 *  - `selection` → on CHOISIT parmi des options (touches, chips, segments, case).
 *  - `none`      → le composant gère sa propre haptique, plus expressive
 *                  (maintien pour envoyer, clavier de montant).
 * Toujours à la pose du doigt, jamais au relâchement : plus tard, le retour
 * arriverait après l'action et donnerait une sensation de latence.
 */
import React, { useCallback } from 'react';
import { Pressable as RNPressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming, useReducedMotion } from 'react-native-reanimated';
import { springs, durations, PRESS_SCALE } from '../tokens';
import { haptic } from '../../lib/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(RNPressable);

/** Ampleur du dépassement au relâchement, en fraction de la course d'appui. */
const OVERSHOOT = 0.35;

export type PressHaptic = 'light' | 'selection' | 'none';

export type KPressableProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** Désactive le retour visuel (ex. ligne de liste qui a son propre fond pressé). */
  noScale?: boolean;
  /** Intention tactile (§5). Par défaut : on choisit. */
  haptic?: PressHaptic;
  /** Dépassement au relâchement : boutons uniquement (§6.2). */
  overshoot?: boolean;
};

export function Pressable({
  style, noScale, haptic: hapticKind = 'selection', overshoot, onPressIn, onPressOut, disabled, children, ...rest
}: KPressableProps) {
  const pressed = useSharedValue(0);
  const reduced = useReducedMotion();

  const animated = useAnimatedStyle(() => {
    if (noScale) return {};
    if (reduced) return { opacity: 1 - Math.max(0, pressed.value) * 0.3 };
    return { transform: [{ scale: 1 - pressed.value * (1 - PRESS_SCALE) }] };
  });

  const inH = useCallback<NonNullable<PressableProps['onPressIn']>>(
    (e) => {
      pressed.value = reduced ? withTiming(1, { duration: durations.micro }) : withSpring(1, springs.snappy);
      if (!disabled) {
        if (hapticKind === 'light') haptic.light();
        else if (hapticKind === 'selection') haptic.selection();
      }
      onPressIn?.(e);
    },
    [onPressIn, pressed, reduced, hapticKind, disabled],
  );

  const outH = useCallback<NonNullable<PressableProps['onPressOut']>>(
    (e) => {
      if (reduced) pressed.value = withTiming(0, { duration: durations.micro });
      else if (overshoot && !noScale) {
        // Valeur NÉGATIVE : le scale passe au-dessus de 1 avant de retomber.
        pressed.value = withSequence(withSpring(-OVERSHOOT, springs.snappy), withSpring(0, springs.snappy));
      } else pressed.value = withSpring(0, springs.snappy);
      onPressOut?.(e);
    },
    [onPressOut, pressed, reduced, overshoot, noScale],
  );

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={inH}
      onPressOut={outH}
      style={[style, animated]}
      accessibilityRole={rest.accessibilityRole ?? 'button'}
      accessibilityState={{ disabled: !!disabled, ...(rest.accessibilityState ?? {}) }}
    >
      {children}
    </AnimatedPressable>
  );
}
