/**
 * Halo — le seul dégradé de l'app (§2.2), en SVG radial, et la SEULE animation
 * ambiante autorisée (doctrine §3, cf. ui/tokens.ts). Il respire : un cycle
 * lent de `durations.haloBreath` qui fait varier l'échelle et l'opacité de
 * quelques pour cent. Assez pour que l'écran soit vivant quand on ne touche à
 * rien, assez lent pour qu'on ne le remarque jamais consciemment.
 *
 * `mood` : hausse = plus lumineux, frange chaude ; baisse = plus faible, froid.
 *
 * Deux usages :
 *  - <Halo size /> : disque autonome (onboarding, Design Lab).
 *  - <HaloBackdrop /> : COUCHE PLEINE LARGEUR (left 0 → right 0), posée derrière
 *    le contenu de l'accueil : le dégradé est centré en haut à droite et fond dans
 *    l'Encre bien avant les bords → aucune coupure possible, quel que soit l'écran.
 */
import React, { useEffect } from 'react';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Stop, Circle, Rect } from 'react-native-svg';
import { useTheme } from '../theme';
import { durations } from '../tokens';

function useStops(mood: 'up' | 'down' | 'flat') {
  const { halo } = useTheme();
  const intensity = mood === 'up' ? 1 : mood === 'down' ? 0.55 : 0.8;
  const warm = mood === 'down' ? 'rgba(207,227,255,0.25)' : halo.stops[2];
  return { halo, intensity, warm };
}

/**
 * Cycle de respiration partagé : va-et-vient 0 → 1 sur une demi-période, en
 * sinus (aucun à-coup aux extrémités). Sur le thread UI, donc insensible à la
 * charge JavaScript. Immobile si « Réduire les animations » est actif.
 */
function useBreath(amplitude: { scale: number; opacity: number }) {
  const v = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) { v.value = 0; return; }
    v.value = withRepeat(
      withTiming(1, { duration: durations.haloBreath / 2, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [v, reduced]);
  return useAnimatedStyle(() => ({
    transform: [{ scale: 1 + v.value * amplitude.scale }],
    opacity: 1 - amplitude.opacity + v.value * amplitude.opacity,
  }));
}

export function Halo({ size = 320, mood = 'flat', style }: { size?: number; mood?: 'up' | 'down' | 'flat'; style?: object }) {
  const { halo, intensity, warm } = useStops(mood);
  const breath = useBreath({ scale: 0.06, opacity: 0.12 });
  return (
    <Animated.View pointerEvents="none" style={[{ width: size, height: size, opacity: halo.opacity * intensity }, style, breath]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
            <Stop offset={0} stopColor={halo.stops[0]} stopOpacity={0.9} />
            <Stop offset={0.35} stopColor={halo.stops[1]} stopOpacity={0.55} />
            <Stop offset={0.7} stopColor={warm} stopOpacity={0.3} />
            <Stop offset={0.92} stopColor={halo.stops[1]} stopOpacity={0} />
            <Stop offset={1} stopColor={halo.stops[1]} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#halo)" />
      </Svg>
    </Animated.View>
  );
}

/** Couche pleine largeur derrière le solde. `height` = zone couverte depuis le haut. */
export function HaloBackdrop({ mood = 'flat', height = 380, top = 0 }: { mood?: 'up' | 'down' | 'flat'; height?: number; top?: number }) {
  const { halo, intensity, warm } = useStops(mood);
  // Couche large : amplitude réduite de moitié, sinon le mouvement devient
  // perceptible sur toute la largeur de l'écran et distrait de la lecture du solde.
  const breath = useBreath({ scale: 0.03, opacity: 0.08 });
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', top, left: 0, right: 0, height, opacity: halo.opacity * intensity }, breath]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          {/* Centre en haut à droite ; rayon 45 % → transparent avant tout bord. */}
          <RadialGradient id="haloBackdrop" cx="82%" cy="28%" rx="45%" ry="45%" gradientUnits="objectBoundingBox">
            <Stop offset={0} stopColor={halo.stops[0]} stopOpacity={0.85} />
            <Stop offset={0.3} stopColor={halo.stops[1]} stopOpacity={0.5} />
            <Stop offset={0.65} stopColor={warm} stopOpacity={0.25} />
            <Stop offset={0.92} stopColor={halo.stops[1]} stopOpacity={0} />
            <Stop offset={1} stopColor={halo.stops[1]} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill="url(#haloBackdrop)" />
      </Svg>
    </Animated.View>
  );
}
