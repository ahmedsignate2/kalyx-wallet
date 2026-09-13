/**
 * Halo — le seul dégradé de l'app (§2.2), en SVG radial. Version STATIQUE
 * (la respiration arrive avec Skia à l'étape finition).
 * `mood` : hausse = plus lumineux, frange chaude ; baisse = plus faible, froid.
 *
 * Deux usages :
 *  - <Halo size /> : disque autonome (onboarding, Design Lab).
 *  - <HaloBackdrop /> : COUCHE PLEINE LARGEUR (left 0 → right 0), posée derrière
 *    le contenu de l'accueil : le dégradé est centré en haut à droite et fond dans
 *    l'Encre bien avant les bords → aucune coupure possible, quel que soit l'écran.
 */
import React from 'react';
import { View } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Circle, Rect } from 'react-native-svg';
import { useTheme } from '../theme';

function useStops(mood: 'up' | 'down' | 'flat') {
  const { halo } = useTheme();
  const intensity = mood === 'up' ? 1 : mood === 'down' ? 0.55 : 0.8;
  const warm = mood === 'down' ? 'rgba(207,227,255,0.25)' : halo.stops[2];
  return { halo, intensity, warm };
}

export function Halo({ size = 320, mood = 'flat', style }: { size?: number; mood?: 'up' | 'down' | 'flat'; style?: object }) {
  const { halo, intensity, warm } = useStops(mood);
  return (
    <View pointerEvents="none" style={[{ width: size, height: size, opacity: halo.opacity * intensity }, style]}>
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
    </View>
  );
}

/** Couche pleine largeur derrière le solde. `height` = zone couverte depuis le haut. */
export function HaloBackdrop({ mood = 'flat', height = 380, top = 0 }: { mood?: 'up' | 'down' | 'flat'; height?: number; top?: number }) {
  const { halo, intensity, warm } = useStops(mood);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top, left: 0, right: 0, height, opacity: halo.opacity * intensity }}>
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
    </View>
  );
}
