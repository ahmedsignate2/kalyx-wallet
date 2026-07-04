/**
 * Design system Nova — thèmes SOMBRE (premium, fond noir bleuté, glassmorphism,
 * accents violet/bleu) et CLAIR (même identité sur fonds froids très clairs).
 *
 * Usage : `const { colors, gradients, typography, shadow } = useTheme();` dans
 * chaque composant. `fonts`, `radii` et `spacing` restent statiques (identiques
 * dans les deux thèmes). Les deux objets de thème sont construits UNE fois
 * (références stables → pas de re-rendus parasites, memo-friendly).
 */
import type { TextStyle } from 'react-native';
import { useColorScheme } from 'react-native';
import { useSettings } from '../lib/settingsStore';

export type ThemeMode = 'dark' | 'light';

/* ------------------------------------------------------------------ */
/* Constantes indépendantes du thème                                   */
/* ------------------------------------------------------------------ */

export const radii = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 } as const;

export const spacing = (n: number) => n * 8;

/**
 * Typo custom (Inter, chargée dans app/_layout.tsx via useFonts).
 * Sur Android, une fontFamily custom ignore fontWeight : on choisit donc le
 * fichier de graisse directement.
 */
export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
} as const;

// Typé TextStyle['fontVariant'] (mutable) pour rester assignable aux styles RN.
// `tabular-nums` = chiffres à largeur fixe (les montants ne « sautent » pas).
const tnum: NonNullable<TextStyle['fontVariant']> = ['tabular-nums'];

/* ------------------------------------------------------------------ */
/* Palettes                                                            */
/* ------------------------------------------------------------------ */

const darkColors = {
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

export type ThemeColors = { [K in keyof typeof darkColors]: string };

/**
 * Thème clair : mêmes rôles, fonds froids très clairs, cartes blanches.
 * Les accents/sémantiques sont assombris pour garder le contraste sur blanc
 * (le violet/bleu de marque bruts sont trop clairs pour du texte sur blanc).
 */
const lightColors: ThemeColors = {
  bg: '#F4F6FB',
  bgDeep: '#EDF0F7',
  bgElevated: '#FFFFFF',
  card: '#FFFFFF',
  cardBorder: '#E4E8F1',
  glass: 'rgba(16,21,35,0.04)',
  glassStrong: 'rgba(16,21,35,0.07)',
  glassBorder: 'rgba(16,21,35,0.10)',
  text: '#12151D',
  textMuted: '#5B6577',
  textFaint: '#9AA3B5',
  accent: '#6A4BF4',
  accentAlt: '#1F7AD9',
  violet: '#6A4BF4',
  blue: '#1F7AD9',
  success: '#178A50',
  danger: '#D64545',
  warning: '#B26A00',
  up: '#178A50',
  down: '#D64545',
};

/* ------------------------------------------------------------------ */
/* Construction des thèmes                                             */
/* ------------------------------------------------------------------ */

function buildTheme(mode: ThemeMode) {
  const colors = mode === 'dark' ? darkColors : lightColors;

  /** Dégradés réutilisables (compatibles expo-linear-gradient). */
  const gradients =
    mode === 'dark'
      ? {
          screen: ['#0E1220', '#0A0C14', '#07090F'] as const,
          accent: ['#7C5CFF', '#4AA8FF'] as const,
          card: ['rgba(124,92,255,0.34)', 'rgba(74,168,255,0.12)', 'rgba(7,9,15,0)'] as const,
          violet: ['#8E6BFF', '#6A4DFF'] as const,
          /** Reflet supérieur des cartes verre. */
          sheen: ['rgba(255,255,255,0.10)', 'rgba(255,255,255,0)'] as const,
        }
      : {
          screen: ['#FAFBFE', '#F4F6FB', '#EDF0F7'] as const,
          accent: ['#7C5CFF', '#4AA8FF'] as const, // identité de marque conservée (texte blanc dessus)
          card: ['rgba(124,92,255,0.16)', 'rgba(74,168,255,0.07)', 'rgba(255,255,255,0)'] as const,
          violet: ['#8E6BFF', '#6A4DFF'] as const,
          sheen: ['rgba(255,255,255,0.85)', 'rgba(255,255,255,0)'] as const,
        };

  const typography = {
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

  /** Ombres douces (élévation premium) — plus légères sur fond clair. */
  const shadow = {
    card:
      mode === 'dark'
        ? {
            shadowColor: '#000',
            shadowOpacity: 0.45,
            shadowRadius: 32,
            shadowOffset: { width: 0, height: 16 },
            elevation: 12,
          }
        : {
            shadowColor: '#3A4A6B',
            shadowOpacity: 0.12,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 10 },
            elevation: 6,
          },
  } as const;

  return { mode, colors, gradients, typography, shadow, accentGradient: gradients.accent };
}

export type Theme = ReturnType<typeof buildTheme>;

/** Construits une seule fois : références stables entre rendus. */
const THEMES: Record<ThemeMode, Theme> = {
  dark: buildTheme('dark'),
  light: buildTheme('light'),
};

/* ------------------------------------------------------------------ */
/* Hooks                                                               */
/* ------------------------------------------------------------------ */

/**
 * Thème actif : préférence utilisateur (Réglages → Apparence), « système »
 * suivant le mode de l'OS. Sombre par défaut (identité historique de Nova).
 */
export function useTheme(): Theme {
  const pref = useSettings((s) => s.themePref);
  const system = useColorScheme();
  const mode: ThemeMode = pref === 'system' ? (system === 'light' ? 'light' : 'dark') : pref;
  return THEMES[mode];
}

/** Raccourci quand seul `colors` est utile. */
export function useColors(): ThemeColors {
  return useTheme().colors;
}
