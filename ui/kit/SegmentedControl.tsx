/**
 * SegmentedControl — l'indicateur glisse sous l'option choisie (ressort Vif),
 * haptique « selection » (§3.3). Pas de carte par option : un seul rail Orbite.
 */
import { useEffect, useRef, useState } from 'react';
import { View, Pressable as RNPressable } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Text } from './Text';
import { useTheme } from '../theme';
import { radius, springs, fontFamily } from '../tokens';
import { haptic } from '../../lib/haptics';

export function SegmentedControl<T extends string>({ items, value, onChange }: { items: { key: T; label: string }[]; value: T; onChange: (k: T) => void }) {
  const { colors, mode, elevation } = useTheme();
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
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: 42, borderRadius: radius.round, backgroundColor: colors.surface2, flexDirection: 'row', padding: 4 }} accessibilityRole="tablist">
      {width > 0 ? <Animated.View style={[{ position: 'absolute', top: 4, bottom: 4, left: 4, width: segW - 8, borderRadius: radius.round, backgroundColor: mode === 'dark' ? colors.surface3 : colors.surface1 }, mode === 'dark' ? null : elevation, indicator]} /> : null}
      {items.map((it) => {
        const on = it.key === value;
        return (
          <RNPressable key={it.key} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => { if (!on) { haptic.selection(); onChange(it.key); } }} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
            {/* Une ligne : un libellé trop long rétrécit (natif) plutôt que de déborder sur son voisin. */}
            <Text variant="caption" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={{ color: on ? colors.text : colors.textSecondary, fontFamily: on ? fontFamily.semibold : fontFamily.medium }}>{it.label}</Text>
          </RNPressable>
        );
      })}
    </View>
  );
}
