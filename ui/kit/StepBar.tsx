/** StepBar — barre de progression fine (§4.3) : une vraie séquence, donc numérotation justifiée. */
import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useTheme } from '../theme';
import { springs } from '../tokens';

export function StepBar({ step, total }: { step: number; total: number }) {
  const { colors } = useTheme();
  const p = useSharedValue(step / total);
  useEffect(() => {
    p.value = withSpring(step / total, springs.standard);
  }, [step, total, p]);
  const style = useAnimatedStyle(() => ({ width: `${p.value * 100}%` }));
  return (
    <View style={{ height: 3, borderRadius: 2, backgroundColor: colors.surface3, overflow: 'hidden' }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: step }}>
      <Animated.View style={[{ height: 3, backgroundColor: colors.primary }, style]} />
    </View>
  );
}
