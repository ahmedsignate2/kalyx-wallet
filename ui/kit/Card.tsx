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
import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
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

/** Propriétés de MISE EN PAGE : elles vont à l'enveloppe (qui porte l'ombre), le reste à la carte. */
const LAYOUT_KEYS = new Set(['margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginHorizontal', 'marginVertical', 'marginStart', 'marginEnd', 'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf', 'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight', 'position', 'top', 'left', 'right', 'bottom', 'zIndex', 'transform', 'opacity']);

/**
 * PROFONDEUR (Crème) : une ombre douce et brune sous chaque carte. Sur iOS,
 * `overflow: 'hidden'` (qui arrondit le contenu, et l'appui des lignes)
 * effacerait l'ombre : elle est donc portée par une ENVELOPPE, la carte garde
 * son rognage à l'intérieur. En Nuit, une ombre noire plus profonde : invisible
 * sur le fond uni, elle détache la carte des dunes et du ciel ; le liseré du haut
 * accroche la lumière.
 */
function useDepth(style: StyleProp<ViewStyle>, cardStyle: ViewStyle) {
  const { mode } = useTheme();
  const dark = mode === 'dark';
  const flat = (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>;
  const outer: Record<string, unknown> = {};
  const inner: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(flat)) (LAYOUT_KEYS.has(k) ? outer : inner)[k] = v;
  const sized = outer.height !== undefined || outer.flex !== undefined || outer.flexGrow !== undefined || outer.minHeight !== undefined;
  return {
    outer: [outer, { borderRadius: (inner.borderRadius as number | undefined) ?? cardStyle.borderRadius, backgroundColor: (inner.backgroundColor as string | undefined) ?? cardStyle.backgroundColor, shadowColor: dark ? '#000000' : '#5A3A18', shadowOpacity: dark ? 0.45 : 0.07, shadowRadius: dark ? 20 : 16, shadowOffset: { width: 0, height: dark ? 10 : 6 }, elevation: dark ? 6 : 2 }] as StyleProp<ViewStyle>,
    inner: [cardStyle, inner, sized ? { flexGrow: 1 } : null] as StyleProp<ViewStyle>,
  };
}

export function Card({ variant = 'surface', level, padding, padded, gap, tint, rise, delay, onPress, disabled, style, children, ...rest }: CardProps) {
  const cardStyle = useCardStyle({ variant, level, padding, padded, gap, tint });
  const merged: StyleProp<ViewStyle> = [cardStyle, style];
  const depth = useDepth(style, cardStyle);
  if (variant === 'interactive') {
    return (
      <Pressable {...rest} onPress={onPress} disabled={disabled || !onPress} accessibilityRole="button" style={[merged, disabled ? { opacity: 0.4 } : null]}>
        {children}
      </Pressable>
    );
  }
  if (rise || delay !== undefined) {
    return depth ? (
      <Rise delay={delay} style={depth.outer}><View style={depth.inner}>{children}</View></Rise>
    ) : (
      <Rise delay={delay} style={merged}>{children}</Rise>
    );
  }
  return depth ? (
    <View {...rest} style={depth.outer}><View style={depth.inner}>{children}</View></View>
  ) : (
    <View {...rest} style={merged}>{children}</View>
  );
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
