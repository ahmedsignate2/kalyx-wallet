/**
 * Pastilles d'identité : lettre sur disque (`Avatar`) et image distante avec
 * repli lettré (`RemoteIcon`).
 */
import { useState } from 'react';
import { LogoImage } from './LogoImage';
import { Monogram } from './Monogram';
import { useTheme } from '../theme';

/**
 * Lettre sur disque de 42. Fond Lumière par défaut (glyphe encre) ; un fond
 * fourni par l'appelant garde un glyphe couleur texte, lisible dans les deux thèmes.
 */
export function Avatar({ label, color, size = 42 }: { label: string; color?: string; size?: number }) {
  const { colors } = useTheme();
  const bg = color ?? colors.primary;
  const fg = color ? colors.text : colors.onPrimary;
  return <Monogram label={label} size={size} bg={bg} fg={fg} />;
}

/**
 * Icône d'actif (réseau/token) : image distante avec repli AUTO sur cercle lettré
 * si l'URL est absente OU si le chargement échoue (404, hors-ligne, host bloqué).
 * Évite les images cassées et les icônes ETH génériques partout.
 */
export function RemoteIcon({ uri, label, size = 42, color, radius = size / 2 }: { uri?: string | null; label: string; size?: number; color?: string; /** Coins : disque par défaut, carré arrondi pour une icône de dApp. */ radius?: number }) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const letter = (label || '?').slice(0, 1).toUpperCase();
  if (!uri || failed) {
    const bg = color ?? colors.surface2;
    const fg = color ? colors.onPrimary : colors.text;
    return <Monogram label={letter} size={size} bg={bg} fg={fg} radius={radius} />;
  }
  return <LogoImage uri={uri} size={size} radius={radius} onError={() => setFailed(true)} style={{ backgroundColor: colors.surface1 }} />;
}
