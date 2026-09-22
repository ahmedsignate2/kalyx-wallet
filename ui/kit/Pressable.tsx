/**
 * Pressable Kalyx — appui = scale 0.96 avec le ressort « Vif », JAMAIS de
 * changement d'opacité (§3.2). Base de tous les composants tactiles du kit.
 * Respecte « Réduire les animations » : le scale devient un fondu de 150 ms.
 *
 * Retour TACTILE systématique (doctrine §6, cf. ui/tokens.ts) : une impulsion
 * légère au moment où le doigt touche — jamais au relâchement, sinon le retour
 * arrive après l'action et donne une sensation de latence. Les composants qui
 * ont déjà leur propre haptique plus expressive (clavier de montant, maintien
 * pour envoyer, sélecteur segmenté) passent `noHaptic` pour ne pas doubler.
 */
import React, { useCallback } from 'react';
import { Pressable as RNPressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming, useReducedMotion } from 'react-native-reanimated';
import { springs, durations, PRESS_SCALE } from '../tokens';
import { haptic } from '../../lib/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(RNPressable);

export type KPressableProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** Désactive le retour visuel (ex. ligne de liste qui a son propre fond pressé). */
  noScale?: boolean;
  /** Désactive l'impulsion tactile (composant qui gère déjà la sienne). */
  noHaptic?: boolean;
};

export function Pressable({ style, noScale, noHaptic, onPressIn, onPressOut, disabled, children, ...rest }: KPressableProps) {
  const pressed = useSharedValue(0);
  const reduced = useReducedMotion();

  const animated = useAnimatedStyle(() => {
    if (noScale) return {};
    if (reduced) return { opacity: 1 - pressed.value * 0.3 };
    return { transform: [{ scale: 1 - pressed.value * (1 - PRESS_SCALE) }] };
  });

  const inH = useCallback<NonNullable<PressableProps['onPressIn']>>(
    (e) => {
      pressed.value = reduced ? withTiming(1, { duration: durations.micro }) : withSpring(1, springs.snappy);
      if (!noHaptic && !disabled) haptic.selection();
      onPressIn?.(e);
    },
    [onPressIn, pressed, reduced, noHaptic, disabled],
  );
  const outH = useCallback<NonNullable<PressableProps['onPressOut']>>(
    (e) => {
      pressed.value = reduced ? withTiming(0, { duration: durations.micro }) : withSpring(0, springs.snappy);
      onPressOut?.(e);
    },
    [onPressOut, pressed, reduced],
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
