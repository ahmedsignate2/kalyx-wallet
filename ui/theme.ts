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
  // Police de MARQUE (Outfit) : géométrique, premium — pour le wordmark « Nova ».
  brand: 'Outfit_700Bold',
  brandStrong: 'Outfit_800ExtraBold',
} as const;

// Typé TextStyle['fontVariant'] (mutable) pour rester assignable aux styles RN.
// `tabular-nums` = chiffres à largeur fixe (les montants ne « sautent » pas).
const tnum: NonNullable<TextStyle['fontVariant']> = ['tabular-nums'];

/* ------------------------------------------------------------------ */
/* Palettes                                                            */
/* ------------------------------------------------------------------ */

const darkColors = {
  // Fonds
  bg: '#0A0C10',
  bgDeep: '#050608', // fond le plus sombre (bas du dégradé)
  bgElevated: '#12151B',
  card: '#15181E',
  cardBorder: '#242832',
  // Verre (glassmorphism)
  glass: 'rgba(255,255,255,0.04)',
  glassStrong: 'rgba(255,255,255,0.07)',
  glassBorder: 'rgba(255,255,255,0.09)',
  // Texte
  text: '#EFEBE2',
  textMuted: '#8B8A82',
  textFaint: '#5E5D55',
  // Accents
  accent: '#C9A24B',
  accentAlt: '#DDB565',
  violet: '#C9A24B',
  blue: '#DDB565',
  // Sémantique
  success: '#4A9B72',
  danger: '#C1554A',
  warning: '#D4943A',
  up: '#4A9B72',
  down: '#C1554A',
} as const;

export type ThemeColors = { [K in keyof typeof darkColors]: string };

/**
 * Thème clair : mêmes rôles, fonds froids très clairs, cartes blanches.
 * Les accents/sémantiques sont assombris pour garder le contraste sur blanc
 * (le violet/bleu de marque bruts sont trop clairs pour du texte sur blanc).
 */
const lightColors: ThemeColors = {
  bg: '#F6F3EC',
  bgDeep: '#EDE9E0',
  bgElevated: '#FFFFFF',
  card: '#FFFFFF',
  cardBorder: '#E0DCD3',
  glass: 'rgba(16,14,10,0.04)',
  glassStrong: 'rgba(16,14,10,0.07)',
  glassBorder: 'rgba(16,14,10,0.10)',
  text: '#1A1814',
  textMuted: '#6B675E',
  textFaint: '#9E9A91',
  accent: '#A17D2F',
  accentAlt: '#8A6B25',
  violet: '#A17D2F',
  blue: '#8A6B25',
  success: '#2D7A50',
  danger: '#A3403A',
  warning: '#9E6E1E',
  up: '#2D7A50',
  down: '#A3403A',
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
          screen: ['#0E1015', '#0A0C10', '#050608'] as const,
          accent: ['#DDB565', '#B8863A'] as const,
          card: ['rgba(201,162,75,0.20)', 'rgba(186,134,58,0.08)', 'rgba(5,6,8,0)'] as const,
          violet: ['#DDB565', '#C9A24B'] as const,
          /** Reflet supérieur des cartes verre. */
          sheen: ['rgba(255,255,255,0.07)', 'rgba(255,255,255,0)'] as const,
        }
      : {
          screen: ['#FFFFFF', '#F6F3EC', '#EDE9E0'] as const,
          accent: ['#A17D2F', '#8A6B25'] as const, // identité de marque conservée (texte blanc dessus)
          card: ['rgba(161,125,47,0.16)', 'rgba(138,107,37,0.07)', 'rgba(255,255,255,0)'] as const,
          violet: ['#A17D2F', '#8A6B25'] as const,
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
