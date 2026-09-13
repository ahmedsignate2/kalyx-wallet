/**
 * SegmentedControl — l'indicateur glisse sous l'option choisie (ressort Vif),
 * haptique « selection » (§3.3). Pas de carte par option : un seul rail Orbite.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Pressable as RNPressable } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Text } from './Text';
import { useTheme } from '../theme';
import { radius, springs } from '../tokens';
import { haptic } from '../../lib/haptics';

export function SegmentedControl<T extends string>({ items, value, onChange }: { items: { key: T; label: string }[]; value: T; onChange: (k: T) => void }) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, items.findIndex((i) => i.key === value));
  const x = useSharedValue(0);
  const segW = width / Math.max(1, items.length);
  const placed = useRef(false);
  useEffect(() => {
    if (segW <= 0) return;
    // Premier placement : sans ressort (sinon l'indicateur part du 1er segment
    // alors que le texte actif est ailleurs → « deux états actifs »).
    if (!placed.current) {
      x.value = index * segW;
      placed.current = true;
      return;
    }
    x.value = withSpring(index * segW, springs.snappy);
  }, [index, segW, x]);
  const indicator = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: 40, borderRadius: radius.input, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', padding: 3 }} accessibilityRole="tablist">
      {width > 0 ? <Animated.View style={[{ position: 'absolute', top: 3, bottom: 3, left: 3, width: segW - 6, borderRadius: radius.input - 3, backgroundColor: colors.surface3 }, indicator]} /> : null}
      {items.map((it) => {
        const on = it.key === value;
        return (
          <RNPressable key={it.key} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => { if (!on) { haptic.selection(); onChange(it.key); } }} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text variant="caption" style={{ color: on ? colors.text : colors.textSecondary }}>{it.label}</Text>
          </RNPressable>
        );
      })}
    </View>
  );
}
