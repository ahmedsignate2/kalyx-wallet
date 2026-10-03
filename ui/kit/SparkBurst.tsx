/**
 * Éclat — quarante particules qui jaillissent d'un point quand l'argent part
 * (maintenir pour envoyer) ou quand un wallet naît. Blanc, glacier, pêche et
 * or : les couleurs du halo, rien d'autre. Rien n'est dessiné avec « réduire
 * les animations » : le succès reste porté par l'haptique et le texte.
 */
import React, { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { BRAND_GOLD } from '../tokens';
import { useReduceMotion } from '../../lib/reduceMotion';

const GOLD = BRAND_GOLD.light;

function Spark({ dx, dy, size, color, delay }: { dx: number; dy: number; size: number; color: string; delay: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withTiming(1, { duration: 800, easing: Easing.bezier(0.16, 1, 0.3, 1) }));
  }, [delay, p]);
  const s = useAnimatedStyle(() => ({
    opacity: 1 - p.value,
    transform: [{ translateX: dx * p.value }, { translateY: dy * p.value }, { scale: 1 - 0.8 * p.value }],
  }));
  return <Animated.View style={[{ position: 'absolute', left: -size / 2, top: -size / 2, width: size, height: size, borderRadius: size / 2, backgroundColor: color }, s]} />;
}

/**
 * Posé au centre de ce qui vient de réussir. Change `burstKey` pour rejouer.
 * Sans mouvement (réduire les animations), rien n'est dessiné : l'état de
 * succès reste porté par la coche et le texte.
 */
export function SparkBurst({ burstKey, count = 40, radius = 90 }: { burstKey: number | string; count?: number; radius?: number }) {
  const reduce = useReduceMotion();
  const sparks = useMemo(() => {
    const palette = ['#FFFFFF', '#CFE3FF', '#FFD9B8', '#E6EEFF', GOLD];
    return Array.from({ length: count }, (_, i) => {
      const a = (i / count) * Math.PI * 2 + (i % 3) * 0.12;
      const d = radius + ((i * 37) % 70);
      return { dx: Math.cos(a) * d, dy: Math.sin(a) * d, size: 3 + (i % 4), color: palette[i % palette.length], delay: (i % 5) * 20 };
    });
  }, [count, radius]);
  if (reduce) return null;
  return (
    <View key={burstKey} pointerEvents="none" style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0 }}>
      {sparks.map((s, i) => <Spark key={i} {...s} />)}
    </View>
  );
}
