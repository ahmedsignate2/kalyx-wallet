/**
 * La comète de chargement (§ détail signature n° 1) : un trait fin de Lumière
 * avec une toute petite lueur au bout — le halo en version minuscule.
 */
import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useTheme } from '../theme';
import { springs } from '../tokens';

export function Comet({ progress }: { /** 0..1 ; 0 ou 1 = masquée. */ progress: number }) {
  const { colors, halo } = useTheme();
  const p = useSharedValue(0);
  const op = useSharedValue(0);
  useEffect(() => {
    const visible = progress > 0 && progress < 1;
    op.value = withTiming(visible ? 1 : 0, { duration: visible ? 80 : 300 });
    p.value = visible ? withSpring(progress, springs.gentle) : withTiming(progress >= 1 ? 1 : 0, { duration: 200 });
  }, [progress, p, op]);
  const line = useAnimatedStyle(() => ({ width: `${p.value * 100}%`, opacity: op.value }));
  const tip = useAnimatedStyle(() => ({ left: `${p.value * 100}%`, opacity: op.value }));
  return (
    <View pointerEvents="none" style={{ height: 2, width: '100%' }}>
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, height: 2, backgroundColor: colors.primary }, line]} />
      <Animated.View style={[{ position: 'absolute', top: -3, marginLeft: -6, width: 12, height: 8, borderRadius: 6, backgroundColor: halo.stops[1], shadowColor: '#FFFFFF', shadowOpacity: 0.9, shadowRadius: 6, elevation: 6 }, tip]} />
    </View>
  );
}
