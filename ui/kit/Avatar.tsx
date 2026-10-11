/**
 * Pastilles d'identité : lettre sur disque (`Avatar`) et image distante avec
 * repli lettré (`RemoteIcon`).
 */
import { useState } from 'react';
import { View } from 'react-native';
import { Text } from './Text';
import { LogoImage } from './LogoImage';
import { useTheme } from '../theme';
import { fontWeight, radii, textSize } from '../tokens';

/**
 * Lettre sur disque de 42. Fond Lumière par défaut (glyphe encre) ; un fond
 * fourni par l'appelant garde un glyphe couleur texte, lisible dans les deux thèmes.
 */
export function Avatar({ label, color, size = 42 }: { label: string; color?: string; size?: number }) {
  const { colors } = useTheme();
  const bg = color ?? colors.primary;
  const fg = color ? colors.text : colors.onPrimary;
  return (
    <View style={{ width: size, height: size, borderRadius: radii.full, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={[textSize('xl'), { color: fg }]}>{label}</Text>
    </View>
  );
}

/**
 * Icône d'actif (réseau/token) : image distante avec repli AUTO sur cercle lettré
 * si l'URL est absente OU si le chargement échoue (404, hors-ligne, host bloqué).
 * Évite les images cassées et les icônes ETH génériques partout.
 */
export function RemoteIcon({ uri, label, size = 42, color }: { uri?: string | null; label: string; size?: number; color?: string }) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const letter = (label || '?').slice(0, 1).toUpperCase();
  if (!uri || failed) {
    const bg = color ?? colors.surface2;
    const fg = color ? colors.onPrimary : colors.text;
    return (
      <View style={{ width: size, height: size, borderRadius: radii.full, alignItems: 'center', justifyContent: 'center', backgroundColor: bg }}>
        {/* Lettre proportionnelle au disque : le seul texte dont la taille suit son conteneur. */}
        <Text style={{ fontSize: size * 0.42, lineHeight: size * 0.56, color: fg, fontFamily: fontWeight.semibold }}>{letter}</Text>
      </View>
    );
  }
  return <LogoImage uri={uri} size={size} onError={() => setFailed(true)} style={{ backgroundColor: colors.surface1 }} />;
}
