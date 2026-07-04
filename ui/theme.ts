/**
 * Design system Nova — thème sombre premium (fond noir bleuté, glassmorphism,
 * accents violet/bleu). Les exports historiques (colors, radii, spacing,
 * typography, accentGradient) restent inchangés pour ne rien casser ; les
 * nouveautés V2 sont ajoutées en dessous.
 */
import type { TextStyle } from 'react-native';

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
  card: ['rgba(124,92,255,0.34)', 'rgba(74,168,255,0.12)', 'rgba(7,9,15,0)'] as const,
  violet: ['#8E6BFF', '#6A4DFF'] as const,
} as const;

export const radii = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 } as const;

export const spacing = (n: number) => n * 8;

/**
 * Typo custom (Inter, chargée dans app/_layout.tsx via useFonts).
 * Sur Android, une fontFamily custom ignore fontWeight : on choisit donc le
 * fichier de graisse directement. `tabular-nums` = chiffres à largeur fixe
 * (les montants ne « sautent » pas quand ils changent — signature fintech).
 */
export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
} as const;

// Typé TextStyle['fontVariant'] (mutable) pour rester assignable aux styles RN.
const tnum: NonNullable<TextStyle['fontVariant']> = ['tabular-nums'];

export const typography = {
  hero: { fontSize: 40, fontFamily: fonts.extrabold, color: colors.text, letterSpacing: -1, fontVariant: tnum },
  display: { fontSize: 34, fontFamily: fonts.bold, color: colors.text, letterSpacing: -0.6, fontVariant: tnum },
  title: { fontSize: 22, fontFamily: fonts.bold, color: colors.text, letterSpacing: -0.3 },
  section: { fontSize: 18, fontFamily: fonts.bold, color: colors.text, letterSpacing: -0.2 },
  body: { fontSize: 16, fontFamily: fonts.regular, color: colors.text },
  bodyStrong: { fontSize: 16, fontFamily: fonts.semibold, color: colors.text },
  muted: { fontSize: 14, fontFamily: fonts.regular, color: colors.textMuted },
  mono: { fontSize: 14, fontFamily: fonts.medium, fontVariant: tnum, color: colors.text },
  /** Montants (listes, cartes) : semibold + chiffres tabulaires. */
  money: { fontSize: 16, fontFamily: fonts.semibold, fontVariant: tnum, color: colors.text },
} as const;

/** Ombres douces (élévation premium). */
export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 16 },
    elevation: 12,
  },
} as const;
