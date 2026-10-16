/**
 * Pastilles d'identité : lettre sur disque (`Avatar`) et image distante avec
 * repli lettré (`RemoteIcon`).
 */
import { useState } from 'react';
import { LogoImage } from './LogoImage';
import { FallbackMark } from './FallbackMark';
import { useTheme } from '../theme';

/**
 * Lettre sur disque de 42. Fond Lumière par défaut (glyphe encre) ; un fond
 * fourni par l'appelant garde un glyphe couleur texte, lisible dans les deux thèmes.
 */
export function Avatar({ label, size = 42, kind = 'token' }: { label: string; color?: string; size?: number; kind?: 'token' | 'site' }) {
  // Plus de lettre sur disque : une marque tirée du nom (jamais deux identiques).
  return <FallbackMark seed={label} size={size} kind={kind} />;
}

/**
 * Icône d'actif (réseau/token) : image distante avec repli AUTO sur cercle lettré
 * si l'URL est absente OU si le chargement échoue (404, hors-ligne, host bloqué).
 * Évite les images cassées et les icônes ETH génériques partout.
 */
export function RemoteIcon({ uri, label, size = 42, radius = size / 2 }: { uri?: string | null; label: string; size?: number; color?: string; /** Coins : disque par défaut, carré arrondi pour une icône de dApp. */ radius?: number }) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  if (!uri || failed) return <FallbackMark seed={label} size={size} radius={radius} />;
  return <LogoImage uri={uri} size={size} radius={radius} onError={() => setFailed(true)} style={{ backgroundColor: colors.surface1 }} />;
}
