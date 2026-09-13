/** Skeleton — au lieu d'un spinner (§5 polish). Pulsation douce Orbite ↔ Crépuscule. */
import React, { useEffect } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, useReducedMotion } from 'react-native-reanimated';
import { useTheme } from '../theme';
import { radius } from '../tokens';

export function Skeleton({ width = '100%', height = 16, round }: { width?: number | `${number}%`; height?: number; round?: boolean }) {
  const { colors } = useTheme();
  const v = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    v.value = reduced ? 0.5 : withRepeat(withTiming(1, { duration: 900 }), -1, true);
  }, [v, reduced]);
  const style = useAnimatedStyle(() => ({ opacity: 0.5 + v.value * 0.5 }));
  return <Animated.View style={[{ width, height, borderRadius: round ? radius.round : radius.chip, backgroundColor: colors.surface3 }, style]} />;
}
