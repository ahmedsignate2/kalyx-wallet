/**
 * TokenIcon — image du token ; si elle manque ou échoue : MONOGRAMME
 * (initiale + couleur tirée du hash du contrat). Jamais d'image cassée (§2.8).
 */
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Text } from './Text';
import { LogoImage } from './LogoImage';
import { glyphFor } from '../../src';
import { useTheme } from '../theme';

export function TokenIcon({ symbol, logo, seed, size = 40, badge }: { symbol: string; logo?: string | null; /** Contrat/mint : détermine la couleur du monogramme. */ seed?: string; size?: number; /** Logo du RÉSEAU, en pastille dans le coin (ETH sur Base, USDC sur BNB…). */ badge?: string | null }) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const bg = useMemo(() => glyphFor(seed ?? symbol).colors[0], [seed, symbol]);
  const icon =
    logo && !failed ? (
      <LogoImage uri={logo} size={size} onError={() => setFailed(true)} style={{ backgroundColor: colors.surface2 }} />
    ) : (
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text variant={size >= 40 ? 'body' : 'caption'} style={{ color: '#0B0D16', fontSize: size * 0.42, lineHeight: size * 0.5 }}>{(symbol || '?').slice(0, 1).toUpperCase()}</Text>
      </View>
    );
  if (!badge) return icon;
  /*
   * PASTILLE DU RÉSEAU, cerclée de la couleur du fond : on lit « ETH, sur
   * Base » d'un coup d'œil. Le logo du réseau remplaçait celui du jeton — ETH
   * sur Base apparaissait en carré bleu.
   */
  const b = Math.round(size * 0.42);
  return (
    <View style={{ width: size, height: size }}>
      {icon}
      <View style={{ position: 'absolute', right: -3, bottom: -3, width: b + 4, height: b + 4, borderRadius: (b + 4) / 2, backgroundColor: colors.surface1, alignItems: 'center', justifyContent: 'center' }}>
        <LogoImage uri={badge} size={b} />
      </View>
    </View>
  );
}
