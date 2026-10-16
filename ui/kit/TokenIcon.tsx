/**
 * TokenIcon — image du token ; si elle manque ou échoue : MONOGRAMME
 * (initiale + couleur tirée du hash du contrat). Jamais d'image cassée (§2.8).
 */
import { useState } from 'react';
import { View } from 'react-native';
import { FallbackMark } from './FallbackMark';
import { LogoImage } from './LogoImage';
import { useTheme } from '../theme';

export function TokenIcon({ symbol, logo, seed, size = 40, badge }: { symbol: string; logo?: string | null; /** Contrat/mint : détermine la couleur du monogramme. */ seed?: string; size?: number; /** Logo du RÉSEAU, en pastille dans le coin (ETH sur Base, USDC sur BNB…). */ badge?: string | null }) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const icon =
    logo && !failed ? (
      <LogoImage uri={logo} size={size} onError={() => setFailed(true)} style={{ backgroundColor: colors.surface2 }} />
    ) : (
      <FallbackMark seed={seed ?? symbol} size={size} />
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
