/**
 * TokenIcon — image du token ; si elle manque ou échoue : MONOGRAMME
 * (initiale + couleur tirée du hash du contrat). Jamais d'image cassée (§2.8).
 */
import React, { useMemo, useState } from 'react';
import { Image, View } from 'react-native';
import { Text } from './Text';
import { glyphFor } from '../../src';
import { useTheme } from '../theme';

export function TokenIcon({ symbol, logo, seed, size = 40 }: { symbol: string; logo?: string | null; /** Contrat/mint : détermine la couleur du monogramme. */ seed?: string; size?: number }) {
  const { colors, mode } = useTheme();
  const [failed, setFailed] = useState(false);
  const bg = useMemo(() => glyphFor(seed ?? symbol).colors[0], [seed, symbol]);
  if (logo && !failed) {
    return <Image source={{ uri: logo }} onError={() => setFailed(true)} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surface2 }} accessibilityIgnoresInvertColors />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text variant={size >= 40 ? 'body' : 'caption'} style={{ color: '#0B0D16', fontSize: size * 0.42, lineHeight: size * 0.5 }}>{(symbol || '?').slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}
