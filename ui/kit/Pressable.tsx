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
import { journal } from '../../lib/debugJournal';
import React, { useCallback } from 'react';
import { Pressable as RNPressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming, useReducedMotion } from 'react-native-reanimated';
import { springs, durations, PRESS_SCALE } from '../tokens';
import { haptic } from '../../lib/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(RNPressable);

/**
 * Premier texte visible d'un bouton, pour le JOURNAL quand il n'a pas de
 * libellé explicite. Des dizaines de lignes ressortaient « (bouton sans
 * libellé) » — lignes de liste, jetons, portefeuilles : impossible de savoir ce
 * qui avait été touché. Le PREMIER texte seulement (le titre, pas le solde qui
 * suit), et toute chaîne longue sans espace (adresse, hachage) est masquée :
 * le journal ne porte jamais de valeur.
 */
export function firstText(node: React.ReactNode, depth = 0): string | null {
  if (depth > 8 || node == null || typeof node === 'boolean') return null;
  if (typeof node === 'string' || typeof node === 'number') {
    const s = String(node).trim();
    return s ? s : null;
  }
  if (Array.isArray(node)) {
    for (const n of node) {
      const s = firstText(n, depth + 1);
      if (s) return s;
    }
    return null;
  }
  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode; title?: unknown; label?: unknown };
    // Composants du kit qui reçoivent leur texte en propriété (ListRow, Chip…).
    for (const k of ['title', 'label'] as const) {
      if (typeof props[k] === 'string' && (props[k] as string).trim()) return (props[k] as string).trim();
    }
    return firstText(props.children, depth + 1);
  }
  return null;
}

/** Libellé journalisable : borné, adresses et hachages masqués. */
export function journalLabel(text: string): string {
  return text.replace(/\S{20,}/g, '…').slice(0, 48);
}

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

  // Journal de diagnostic : chaque appui, avec le libellé du bouton (jamais sa valeur).
  const userPress = rest.onPress;
  const onPress = useCallback<NonNullable<PressableProps['onPress']>>(
    (e) => {
      const derived = typeof children === 'function' ? null : firstText(children as React.ReactNode);
      const label = rest.accessibilityLabel?.trim() || rest.testID || (derived ? journalLabel(derived) : '(bouton sans libellé)');
      journal('press', label, disabled ? '(désactivé)' : '');
      userPress?.(e);
    },
    [userPress, rest.accessibilityLabel, rest.testID, children, disabled],
  );

  return (
    <AnimatedPressable
      {...rest}
      onPress={userPress ? onPress : undefined}
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
