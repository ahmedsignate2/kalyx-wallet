/**
 * Curseur à crans — choisir « quelle part de mon solde » au pouce.
 *
 * Cinq crans (0, 25, 50, 75 %, Max). Le pouce suit le doigt librement, mais la
 * valeur ne prend que les crans : à chaque cran franchi, une vibration sèche
 * et le montant se met à jour aussitôt. Au relâchement, le pouce se pose sur le
 * cran au ressort. Le trait se remplit de la couleur de l'actif.
 *
 * Pensé pour compléter le clavier, pas le remplacer : le clavier pour un
 * montant précis, le curseur pour « la moitié », « tout ».
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Text } from './kit';
import { useTheme } from './theme';
import { BRAND_GOLD, fontFamily } from './tokens';
import { haptic } from '../lib/haptics';

const SNAPS = [0, 25, 50, 75, 100];
const THUMB = 26;

export function SnapSlider({ value, onChange, accent, maxLabel }: { value: number | null; onChange: (pct: number) => void; accent?: string | null; maxLabel: string }) {
  const { colors } = useTheme();
  const tint = accent ?? BRAND_GOLD.light;
  const [w, setW] = useState(0);
  const x = useSharedValue(0);
  const idxRef = useRef(-1);
  const startX = useRef(0);
  const dragging = useRef(false);
  const track = Math.max(1, w - THUMB);

  // Position du pouce quand la valeur change d'ailleurs (clavier → retour à 0, bouton Max…).
  const shownIdx = value == null ? 0 : Math.max(0, SNAPS.indexOf(value));
  useEffect(() => {
    if (!w || dragging.current) return;
    idxRef.current = shownIdx;
    x.value = withSpring((SNAPS[shownIdx] / 100) * track, { damping: 18, stiffness: 260 });
  }, [shownIdx, w, track, x]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          dragging.current = true;
          // Toucher le trait y amène le pouce directement.
          const px = Math.min(track, Math.max(0, e.nativeEvent.locationX - THUMB / 2));
          startX.current = px;
          x.value = px;
          snapTo(px, false);
        },
        onPanResponderMove: (_e, g) => {
          const px = Math.min(track, Math.max(0, startX.current + g.dx));
          x.value = px;
          snapTo(px, false);
        },
        onPanResponderRelease: (_e, g) => {
          const px = Math.min(track, Math.max(0, startX.current + g.dx));
          snapTo(px, true);
          dragging.current = false;
        },
        onPanResponderTerminate: () => {
          dragging.current = false;
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [track],
  );

  function snapTo(px: number, settle: boolean) {
    const i = Math.round((px / track) * (SNAPS.length - 1));
    if (i !== idxRef.current) {
      idxRef.current = i;
      haptic.selection();
      onChange(SNAPS[i]);
    }
    if (settle) x.value = withSpring((SNAPS[i] / 100) * track, { damping: 18, stiffness: 260 });
  }

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const fillStyle = useAnimatedStyle(() => ({ width: x.value + THUMB / 2 }));

  return (
    <View style={{ gap: 8 }}>
      <View
        {...pan.panHandlers}
        onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
        style={{ height: 36, justifyContent: 'center' }}
        accessibilityRole="adjustable"
        accessibilityValue={{ min: 0, max: 100, now: value ?? 0 }}
      >
        <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surface3, marginHorizontal: THUMB / 2 }} />
        <Animated.View style={[{ position: 'absolute', left: 0, height: 6, borderRadius: 3, backgroundColor: tint, opacity: 0.85 }, fillStyle]} />
        {/* Crans */}
        {w
          ? SNAPS.map((s) => (
              <View key={s} pointerEvents="none" style={{ position: 'absolute', left: THUMB / 2 + (s / 100) * track - 2, width: 4, height: 4, borderRadius: 2, backgroundColor: (value ?? -1) >= s ? colors.bg : colors.textTertiary }} />
            ))
          : null}
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, width: THUMB, height: THUMB, borderRadius: THUMB / 2, backgroundColor: colors.primary, borderWidth: 3, borderColor: tint, shadowColor: tint, shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 6 }, thumbStyle]} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 }}>
        {SNAPS.map((s) => (
          <Text key={s} variant="micro" style={{ fontFamily: fontFamily.semibold, color: value === s ? colors.text : colors.textTertiary, width: 40, textAlign: s === 0 ? 'left' : s === 100 ? 'right' : 'center' }}>
            {s === 100 ? maxLabel : `${s} %`}
          </Text>
        ))}
      </View>
    </View>
  );
}
