/**
 * Card — LE conteneur de l'app (bible §2.7). Une seule carte par GROUPE, jamais
 * par ligne. Zéro ombre : la profondeur vient des niveaux de surface.
 *
 * Variantes :
 *  - `surface`     : Nuit / Orbite / Crépuscule selon `level`, liseré du haut
 *                    plus clair (la lumière accroche l'arête).
 *  - `glass`       : carte de groupe de liste, trait uniforme, sans liseré —
 *                    les lignes posées dessus portent leurs propres séparateurs.
 *  - `interactive` : `surface` tactile (scale du kit, rôle bouton).
 *
 * `rise` / `delay` : la carte monte à l'entrée (cascade autorisée sur un écran
 * figé, jamais sur une liste de données — doctrine d'animation, tokens.ts).
 */
import React from 'react';
import { View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { Pressable } from './Pressable';
import { Rise } from './entrance';
import { useTheme } from '../theme';
import { radii, spaces } from '../tokens';
import { mixHex, withAlpha } from '../../lib/tokenColors';

export type CardVariant = 'surface' | 'glass' | 'interactive';
export type SpaceToken = keyof typeof spaces;

type CardProps = ViewProps & {
  variant?: CardVariant;
  /** Niveau de surface : 1 Nuit (défaut), 2 Orbite, 3 Crépuscule. */
  level?: 1 | 2 | 3;
  /** Marge intérieure (cran d'espacement). `padded={false}` = aucune. */
  padding?: SpaceToken;
  padded?: boolean;
  /** Espacement entre les enfants. */
  gap?: SpaceToken;
  /** Couleur de l'actif : la carte en est très légèrement teintée (fiche token). */
  tint?: string | null;
  /** Monte à l'entrée. Implicite dès qu'un `delay` est donné. */
  rise?: boolean;
  delay?: number;
  /** Variante `interactive` uniquement. */
  onPress?: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
};

export function useCardStyle({ variant = 'surface', level = 1, padding = 'lg', padded = true, gap, tint }: Pick<CardProps, 'variant' | 'level' | 'padding' | 'padded' | 'gap' | 'tint'>): ViewStyle {
  const { colors, mode } = useTheme();
  const base = level === 3 ? colors.surface3 : level === 2 ? colors.surface2 : colors.surface1;
  const bg = tint && mode === 'dark' ? mixHex(base, tint, 0.07) : base;
  const border = tint ? withAlpha(tint, 0.16) : colors.border;
  const top = variant === 'glass' ? border : tint ? withAlpha(tint, 0.32) : colors.rim;
  return {
    backgroundColor: bg,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: border,
    borderTopColor: top,
    padding: padded ? spaces[padding] : 0,
    gap: gap ? spaces[gap] : undefined,
    overflow: 'hidden',
  };
}

export function Card({ variant = 'surface', level, padding, padded, gap, tint, rise, delay, onPress, disabled, style, children, ...rest }: CardProps) {
  const cardStyle = useCardStyle({ variant, level, padding, padded, gap, tint });
  const merged: StyleProp<ViewStyle> = [cardStyle, style];
  if (variant === 'interactive') {
    return (
      <Pressable {...rest} onPress={onPress} disabled={disabled || !onPress} accessibilityRole="button" style={[merged, disabled ? { opacity: 0.4 } : null]}>
        {children}
      </Pressable>
    );
  }
  if (rise || delay !== undefined) {
    return <Rise delay={delay} style={merged}>{children}</Rise>;
  }
  return <View {...rest} style={merged}>{children}</View>;
}

/**
 * Un tronçon de carte `glass` pour une ligne de liste virtualisée : la carte
 * est reconstituée par ses lignes (bords arrondis sur la première et la
 * dernière), puisqu'une FlatList ne peut pas envelopper ses cellules.
 */
export function CardCell({ first, last, children }: { first: boolean; last: boolean; children: React.ReactNode }) {
  const card = useCardStyle({ variant: 'glass' });
  const pad = spaces.lg;
  return (
    <View
      style={[
        card,
        {
          borderTopWidth: first ? 1 : 0,
          borderBottomWidth: last ? 1 : 0,
          borderTopLeftRadius: first ? radii.xl : 0,
          borderTopRightRadius: first ? radii.xl : 0,
          borderBottomLeftRadius: last ? radii.xl : 0,
          borderBottomRightRadius: last ? radii.xl : 0,
          paddingTop: first ? pad : 0,
          paddingBottom: last ? pad : 0,
        },
      ]}
    >
      {children}
    </View>
  );
}

/** Séparateur de liste (1 px Trait, retrait gauche optionnel). */
export function Divider({ inset = 0 }: { inset?: number }) {
  const { colors } = useTheme();
  return <View style={{ height: 1, backgroundColor: colors.border, marginLeft: inset }} />;
}
