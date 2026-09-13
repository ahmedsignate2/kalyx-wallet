/** CountdownRing — petit anneau qui se vide (§4.5) : validité du devis. SVG, sans Skia. */
import React from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../theme';

export function CountdownRing({ progress, size = 18 }: { /** 1 = plein, 0 = vide. */ progress: number; size?: number }) {
  const { colors } = useTheme();
  const r = (size - 3) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  return (
    <View style={{ width: size, height: size }} accessibilityLabel={`Devis valable ${Math.round(p * 100)} %`}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.surface3} strokeWidth={2} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.text} strokeWidth={2} fill="none" strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - p)} strokeLinecap="round" rotation={-90} origin={`${size / 2}, ${size / 2}`} />
      </Svg>
    </View>
  );
}
