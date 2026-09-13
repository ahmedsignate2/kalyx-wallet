/**
 * Surface — conteneur de la bible (§2.7) : Nuit (level 1), Orbite (level 2),
 * rayon 22, bordure Trait. Une seule carte par GROUPE, jamais par ligne.
 * Zéro ombre : la profondeur vient des niveaux.
 */
import React from 'react';
import { View, type ViewProps } from 'react-native';
import { useTheme } from '../theme';
import { radius, space } from '../tokens';

export function Surface({ level = 1, padded = true, style, ...rest }: ViewProps & { level?: 1 | 2 | 3; padded?: boolean }) {
  const { colors } = useTheme();
  const bg = level === 3 ? colors.surface3 : level === 2 ? colors.surface2 : colors.surface1;
  return <View {...rest} style={[{ backgroundColor: bg, borderRadius: radius.container, borderWidth: 1, borderColor: colors.border, padding: padded ? space[4] : 0, overflow: 'hidden' }, style]} />;
}

/** Séparateur de liste (1 px Trait, retrait gauche optionnel). */
export function Divider({ inset = 0 }: { inset?: number }) {
  const { colors } = useTheme();
  return <View style={{ height: 1, backgroundColor: colors.border, marginLeft: inset }} />;
}
