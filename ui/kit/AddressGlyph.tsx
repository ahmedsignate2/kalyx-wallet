/**
 * AddressGlyph — l'étoile unique d'une adresse (§2.9), rendue en SVG
 * (`react-native-svg`, déjà dans le build ; la version Skia viendra avec le halo).
 */
import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { glyphFor, starPath } from '../../src';
import { useTheme } from '../theme';

export function AddressGlyph({ address, size = 40, background = true }: { address: string; size?: number; /** Disque Orbite derrière l'étoile. */ background?: boolean }) {
  const { colors } = useTheme();
  const spec = useMemo(() => glyphFor(address), [address]);
  const c = size / 2;
  const r = size * 0.36;
  const d = useMemo(() => starPath(spec, c, c, r), [spec, c, r]);
  const id = useMemo(() => `g${address.slice(-8)}`, [address]);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: background ? colors.surface2 : 'transparent', alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Glyphe de l’adresse">
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={spec.colors[0]} />
            <Stop offset="1" stopColor={spec.colors[1]} />
          </LinearGradient>
        </Defs>
        <Path d={d} fill={`url(#${id})`} />
        {spec.satellite !== null ? (
          <Circle cx={c + r * 1.15 * Math.cos((spec.satellite * Math.PI) / 180)} cy={c + r * 1.15 * Math.sin((spec.satellite * Math.PI) / 180)} r={size * 0.05} fill={spec.colors[1]} />
        ) : null}
      </Svg>
    </View>
  );
}
