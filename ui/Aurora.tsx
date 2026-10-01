/**
 * AURORE — la lumière vivante derrière le solde.
 *
 * Trois nappes de lumière (or de la marque, glacier, et une teinte d'humeur :
 * verte quand le portefeuille monte aujourd'hui, froide quand il baisse) qui
 * dérivent très lentement, chacune sur sa propre période — elles ne se
 * synchronisent jamais, le ciel ne se répète pas. Tout tourne sur le thread UI
 * (transform + opacité), sans flou natif : des dégradés radiaux SVG suffisent.
 *
 * Discrète par construction : opacités basses, mouvements lents (14 à 22 s).
 * « Réduire les animations » la fige, sans l'éteindre.
 */
import React, { useEffect } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useTheme } from './theme';
import { useReduceMotion } from '../lib/reduceMotion';

type Blob = { id: string; color: string; size: number; x: number; y: number; dx: number; dy: number; period: number; opacity: number };

function Nappe({ b, reduce }: { b: Blob; reduce: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    t.value = withRepeat(withTiming(1, { duration: b.period, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(t);
  }, [reduce, b.period, t]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: b.dx * t.value }, { translateY: b.dy * t.value }, { scale: 1 + 0.12 * t.value }],
    opacity: b.opacity * (0.75 + 0.25 * t.value),
  }));
  const gid = `aur-${b.id}`;
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: b.x - b.size / 2, top: b.y - b.size / 2, width: b.size, height: b.size }, style]}>
      <Svg width={b.size} height={b.size}>
        <Defs>
          <RadialGradient id={gid} cx="50%" cy="50%" r="50%">
            <Stop offset={0} stopColor={b.color} stopOpacity={1} />
            <Stop offset={0.45} stopColor={b.color} stopOpacity={0.45} />
            <Stop offset={1} stopColor={b.color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={b.size / 2} cy={b.size / 2} r={b.size / 2} fill={`url(#${gid})`} />
      </Svg>
    </Animated.View>
  );
}

export function Aurora({ height, mood = 'flat', tint }: {
  height: number;
  mood?: 'up' | 'down' | 'flat';
  /** Couleur de marque d'un actif : elle remplace la nappe glacier (fiche token). */
  tint?: string | null;
}) {
  const { width } = useWindowDimensions();
  const { mode } = useTheme();
  const reduce = useReduceMotion();
  const dark = mode === 'dark';
  const moodColor = mood === 'up' ? '#3CD98A' : mood === 'down' ? '#7FA8FF' : '#B9C8E6';
  const k = dark ? 1 : 0.55;
  const blobs: Blob[] = [
    { id: 'gold', color: '#DDB565', size: width * 1.1, x: width * 0.12, y: height * 0.3, dx: width * 0.18, dy: height * 0.08, period: 17000, opacity: 0.3 * k },
    tint
      ? // Teinte de marque : la nappe la plus large, derrière le nom et le prix.
        { id: 'tint', color: tint, size: width * 1.25, x: width * 0.22, y: height * 0.22, dx: width * 0.16, dy: height * 0.1, period: 19000, opacity: 0.42 * k }
      : { id: 'glacier', color: dark ? '#9FC2FF' : '#7C9CD6', size: width * 0.95, x: width * 0.95, y: height * 0.12, dx: -width * 0.2, dy: height * 0.12, period: 21000, opacity: 0.16 * k },
    { id: 'mood', color: moodColor, size: width * 0.8, x: width * 0.55, y: height * 0.78, dx: width * 0.12, dy: -height * 0.1, period: 14000, opacity: 0.11 * k },
  ];
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height, overflow: 'hidden' }}>
      {blobs.map((b) => (
        <Nappe key={b.id} b={b} reduce={reduce} />
      ))}
    </View>
  );
}
