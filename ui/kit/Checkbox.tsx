/**
 * Case à cocher Kalyx — remplace le caractère texte `☑`/`☐` qui rendait
 * différemment selon la police et n'offrait presque aucune cible tactile.
 *
 * Mouvement (doctrine §1 et §6, cf. ui/tokens.ts) : la case se remplit avec le
 * ressort « Réussite » et la coche se dessine — un seul mouvement, déclenché
 * par le tap. `shake` permet à l'écran de la désigner quand l'utilisateur tente
 * d'avancer sans avoir consenti : on montre CE QUI manque au lieu de griser le
 * bouton et de laisser l'écran muet.
 */
import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../theme';
import { springs, durations, radius } from '../tokens';
import { Pressable } from './Pressable';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const CHECK = 'M4 8.5 L7 11.5 L12.5 5';
const CHECK_LEN = 16; // longueur approx. du tracé, pour le dessin progressif

export function Checkbox({
  checked, onChange, label, shake = 0, size = 22,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Contenu à droite de la case (texte, liens…). */
  label?: React.ReactNode;
  /** Incrémenter cette valeur fait trembler la case (attirer l'attention). */
  shake?: number;
  size?: number;
}) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const on = useSharedValue(checked ? 1 : 0);
  const shakeV = useSharedValue(0);

  useEffect(() => {
    on.value = reduced
      ? withTiming(checked ? 1 : 0, { duration: durations.fade })
      : withSpring(checked ? 1 : 0, springs.bouncy);
  }, [checked, on, reduced]);

  useEffect(() => {
    if (!shake || reduced) return;
    // Une seule séquence qui se termine à 0 : deux allers-retours amortis puis
    // retour au repos. (Enchaîner withRepeat et withTiming écraserait le premier.)
    shakeV.value = withSequence(
      withTiming(1, { duration: 55 }),
      withTiming(-1, { duration: 55 }),
      withTiming(0.6, { duration: 55 }),
      withTiming(-0.6, { duration: 55 }),
      withTiming(0, { duration: 55 }),
    );
  }, [shake, shakeV, reduced]);

  const boxStyle = useAnimatedStyle(() => ({
    backgroundColor: on.value > 0.5 ? colors.primary : 'transparent',
    borderColor: on.value > 0.5 ? colors.primary : colors.border,
    transform: [{ scale: 1 + on.value * 0.06 }, { translateX: shakeV.value * 6 }],
  }));
  const checkProps = useAnimatedProps(() => ({ strokeDashoffset: CHECK_LEN * (1 - on.value) }));

  return (
    <Pressable
      onPress={() => onChange(!checked)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      // Cible tactile confortable : la case fait 22 px mais la zone 44 px.
      hitSlop={12}
      noScale
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}
    >
      <Animated.View
        style={[
          { width: size, height: size, borderRadius: radius.chip - 2, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
          boxStyle,
        ]}
      >
        <Svg width={size * 0.78} height={size * 0.78} viewBox="0 0 17 17">
          <AnimatedPath
            d={CHECK}
            stroke={colors.onPrimary}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            strokeDasharray={CHECK_LEN}
            animatedProps={checkProps}
          />
        </Svg>
      </Animated.View>
      {label ? <View style={{ flex: 1 }}>{label}</View> : null}
    </Pressable>
  );
}
