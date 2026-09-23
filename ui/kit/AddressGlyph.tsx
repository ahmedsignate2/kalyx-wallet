/**
 * AddressGlyph — l'étoile unique d'une adresse (§2.9), rendue en SVG
 * (`react-native-svg`, déjà dans le build ; la version Skia viendra avec le halo).
 */
import React, { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { glyphFor, starPath } from '../../src';
import { useTheme } from '../theme';
import { springs, durations } from '../tokens';
import { useT } from '../../lib/settingsStore';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function AddressGlyph({
  address, size = 40, background = true, draw = false,
}: {
  address: string;
  size?: number;
  /** Disque Orbite derrière l'étoile. */
  background?: boolean;
  /**
   * Naissance du wallet (docs/08 §12.1) : l'étoile s'ouvre au ressort en
   * pivotant, puis son satellite apparaît. Ce moment transforme le glyphe d'outil
   * anti-hameçonnage en identité : c'est là que l'utilisateur apprend à
   * reconnaître son wallet, donc à repérer plus tard une adresse qui n'est pas la
   * sienne. La beauté sert directement la sécurité.
   */
  draw?: boolean;
}) {
  const { colors } = useTheme();
  const t = useT();
  const reduced = useReducedMotion();
  const v = useSharedValue(draw && !reduced ? 0 : 1);
  useEffect(() => {
    if (!draw) return;
    v.value = reduced ? withTiming(1, { duration: durations.fade }) : withSpring(1, springs.gentle);
  }, [draw, reduced, v]);
  const starStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, v.value * 1.4),
    transform: [{ scale: 0.55 + v.value * 0.45 }, { rotate: `${-35 * (1 - v.value)}deg` }],
  }));
  const satProps = useAnimatedProps(() => ({ opacity: Math.max(0, (v.value - 0.55) / 0.45) }));
  const spec = useMemo(() => glyphFor(address), [address]);
  const c = size / 2;
  const r = size * 0.36;
  const d = useMemo(() => starPath(spec, c, c, r), [spec, c, r]);
  const id = useMemo(() => `g${address.slice(-8)}`, [address]);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: background ? colors.surface2 : 'transparent', alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={t('glyphA11y')}>
      <Animated.View style={starStyle}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={spec.colors[0]} />
            <Stop offset="1" stopColor={spec.colors[1]} />
          </LinearGradient>
        </Defs>
        <Path d={d} fill={`url(#${id})`} />
        {spec.satellite !== null ? (
          <AnimatedCircle
            cx={c + r * 1.15 * Math.cos((spec.satellite * Math.PI) / 180)}
            cy={c + r * 1.15 * Math.sin((spec.satellite * Math.PI) / 180)}
            r={size * 0.05}
            fill={spec.colors[1]}
            animatedProps={satProps}
          />
        ) : null}
      </Svg>
      </Animated.View>
    </View>
  );
}
