/**
 * Design system Nova — thème sombre premium (fond noir bleuté, glassmorphism,
 * accents violet/bleu). Les exports historiques (colors, radii, spacing,
 * typography, accentGradient) restent inchangés pour ne rien casser ; les
 * nouveautés V2 sont ajoutées en dessous.
 */
export const colors = {
  // Fonds
  bg: '#0B0E14',
  bgDeep: '#07090F', // fond le plus sombre (bas du dégradé)
  bgElevated: '#121722',
  card: '#151A23',
  cardBorder: '#232A36',
  // Verre (glassmorphism)
  glass: 'rgba(255,255,255,0.05)',
  glassStrong: 'rgba(255,255,255,0.08)',
  glassBorder: 'rgba(255,255,255,0.10)',
  // Texte
  text: '#F5F7FA',
  textMuted: '#8A93A6',
  textFaint: '#5B6577',
  // Accents
  accent: '#7C5CFF',
  accentAlt: '#4AA8FF',
  violet: '#7C5CFF',
  blue: '#4AA8FF',
  // Sémantique
  success: '#2ECC71',
  danger: '#FF5C5C',
  warning: '#FFB020',
  up: '#3DDC97',
  down: '#FF6B6B',
} as const;

export const accentGradient = [colors.accent, colors.accentAlt] as const;

/** Dégradés réutilisables (compatibles expo-linear-gradient). */
export const gradients = {
  screen: ['#0E1220', '#0A0C14', '#07090F'] as const,
  accent: ['#7C5CFF', '#4AA8FF'] as const,
  card: ['rgba(124,92,255,0.18)', 'rgba(74,168,255,0.10)'] as const,
  violet: ['#8E6BFF', '#6A4DFF'] as const,
} as const;

export const radii = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 } as const;

export const spacing = (n: number) => n * 8;

export const typography = {
  hero: { fontSize: 40, fontWeight: '800' as const, color: colors.text, letterSpacing: -0.5 },
  display: { fontSize: 34, fontWeight: '700' as const, color: colors.text },
  title: { fontSize: 22, fontWeight: '700' as const, color: colors.text },
  section: { fontSize: 18, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 16, fontWeight: '400' as const, color: colors.text },
  bodyStrong: { fontSize: 16, fontWeight: '600' as const, color: colors.text },
  muted: { fontSize: 14, fontWeight: '400' as const, color: colors.textMuted },
  mono: { fontSize: 14, fontVariant: ['tabular-nums'] as const, color: colors.text },
} as const;

/** Ombres douces (élévation premium). */
export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
} as const;
