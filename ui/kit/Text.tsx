/**
 * Texte Kalyx — une seule famille (General Sans), échelle de la bible (§2.5).
 * `variant` choisit taille/interligne/graisse ; `tone` la couleur de rôle.
 * Le solde limite la taille système à ×1,3 ; le texte courant n'a pas de limite.
 */
import React from 'react';
import { Text as RNText, type TextProps } from 'react-native';
import { useTheme } from '../theme';
import { BALANCE_MAX_FONT_SCALE, tabularNums } from '../tokens';

export type TextVariant = 'balance' | 'title1' | 'title2' | 'body' | 'bodySecondary' | 'caption' | 'micro';
export type TextTone = 'primary' | 'secondary' | 'tertiary' | 'up' | 'down' | 'warning' | 'danger' | 'onPrimary';

export function Text({
  variant = 'body',
  tone,
  tabular,
  style,
  ...rest
}: TextProps & { variant?: TextVariant; tone?: TextTone; /** Chiffres à largeur fixe (montants). */ tabular?: boolean }) {
  const { colors, typography } = useTheme();
  const toneColor =
    tone === 'secondary' ? colors.textSecondary
    : tone === 'tertiary' ? colors.textTertiary
    : tone === 'up' ? colors.up
    : tone === 'down' ? colors.down
    : tone === 'warning' ? colors.warning
    : tone === 'danger' ? colors.danger
    : tone === 'onPrimary' ? colors.onPrimary
    : tone === 'primary' ? colors.text
    : undefined;
  return (
    <RNText
      {...rest}
      maxFontSizeMultiplier={variant === 'balance' ? BALANCE_MAX_FONT_SCALE : rest.maxFontSizeMultiplier}
      style={[typography[variant], toneColor ? { color: toneColor } : null, tabular ? { fontVariant: tabularNums } : null, style]}
    />
  );
}
