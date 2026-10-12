/** Skeleton — au lieu d'un spinner (§5 polish). Pulsation douce Orbite ↔ Crépuscule. */
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming, useReducedMotion } from 'react-native-reanimated';
import { useLoopActive } from '../useLoopActive';
import { useTheme } from '../theme';
import { radius, spaces } from '../tokens';

export function Skeleton({ width = '100%', height = 16, round }: { width?: number | `${number}%`; height?: number; round?: boolean }) {
  const { colors } = useTheme();
  const v = useSharedValue(0);
  const reduced = useReducedMotion();
  const active = useLoopActive();
  useEffect(() => {
    if (reduced || !active) { cancelAnimation(v); v.value = 0.5; return; }
    v.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
    return () => cancelAnimation(v);
  }, [v, reduced, active]);
  const style = useAnimatedStyle(() => ({ opacity: 0.5 + v.value * 0.5 }));
  return <Animated.View style={[{ width, height, borderRadius: round ? radius.round : radius.chip, backgroundColor: colors.surface3 }, style]} />;
}

/** Ligne squelette (avatar + 2 lignes + valeur) pour les listes en chargement. */
export function SkeletonRow({ divider }: { divider?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spaces.md, paddingVertical: spaces.md, borderTopWidth: divider ? 1 : 0, borderTopColor: colors.border }}>
      <Skeleton width={42} height={42} round />
      <View style={{ flex: 1, gap: spaces.sm }}>
        <Skeleton width="55%" height={14} />
        <Skeleton width="35%" height={11} />
      </View>
      <Skeleton width={56} height={14} />
    </View>
  );
}
