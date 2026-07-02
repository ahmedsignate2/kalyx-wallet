/**
 * Design system — thème sombre premium (inspiration Revolut).
 * Cartes arrondies, contrastes doux, un accent en dégradé.
 */
export const colors = {
  bg: '#0B0E14',
  bgElevated: '#121722',
  card: '#151A23',
  cardBorder: '#232A36',
  text: '#F5F7FA',
  textMuted: '#8A93A6',
  accent: '#6C5CE7',
  accentAlt: '#4AA8FF',
  success: '#2ECC71',
  danger: '#FF5C5C',
  warning: '#FFB020',
} as const;

export const accentGradient = [colors.accent, colors.accentAlt] as const;

export const radii = { sm: 10, md: 16, lg: 22, pill: 999 } as const;

export const spacing = (n: number) => n * 8;

export const typography = {
  display: { fontSize: 34, fontWeight: '700' as const, color: colors.text },
  title: { fontSize: 22, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 16, fontWeight: '400' as const, color: colors.text },
  muted: { fontSize: 14, fontWeight: '400' as const, color: colors.textMuted },
  mono: { fontSize: 14, fontVariant: ['tabular-nums'] as const, color: colors.text },
} as const;
