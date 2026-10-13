/**
 * Thème Kalyx — construit depuis `ui/tokens.ts` (LA source de vérité).
 *
 * Usage : `const { colors, typography, ... } = useTheme();`.
 * Deux niveaux d'API :
 *  - NOUVELLE (bible) : `colors.surface1/2/3`, `colors.primary`, `colors.textSecondary`,
 *    `typography.balance/title1/title2/body/bodySecondary/caption/micro`, `space`, `radius`.
 *  - HÉRITÉE (écrans existants) : `colors.bg/card/accent/textMuted…`, `typography.hero/title/section…`,
 *    `spacing(n)`, `radii`, `gradients`, `shadow` — MAPPÉE sur les tokens pour que toute
 *    l'app se re-skinne d'un coup. Les écrans migrent vers la nouvelle API un par un
 *    (méthode §11) ; à terme l'API héritée disparaît.
 *
 * Les deux thèmes sont construits UNE fois (références stables, memo-friendly).
 */
import { createContext, createElement, useContext, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { useSettings } from '../lib/settingsStore';
import { dark, light, halo, tints, elevation, fontFamily, type, space, spaces, radii, radius, fontSize, lineHeight, textSize, fontWeight, springs, durations, type Palette } from './tokens';

export type ThemeMode = 'dark' | 'light';

/* ------------------------------------------------------------------ */
/* Constantes indépendantes du thème                                   */
/* ------------------------------------------------------------------ */

/**
 * @deprecated Grille héritée : `spacing(n)` = n × 8. Préférer `spaces` / `space`
 * des tokens dans tout nouveau code ; les écrans existants migrent au fil de l'eau.
 */
export const spacing = (n: number) => n * 8;

/** Graisses General Sans. `extrabold`/`brand*` hérités → Bold (une seule famille, §2.5). */
export const fonts = {
  regular: fontFamily.regular,
  medium: fontFamily.medium,
  semibold: fontFamily.semibold,
  bold: fontFamily.bold,
  extrabold: fontFamily.bold,
  brand: fontFamily.bold,
  brandStrong: fontFamily.bold,
} as const;

export { space, spaces, radii, radius, fontSize, lineHeight, textSize, fontWeight, springs, durations, halo };

/* ------------------------------------------------------------------ */
/* Couleurs : tokens + alias hérités                                   */
/* ------------------------------------------------------------------ */

/**
 * Le CIEL de l'accueil : ce qui est posé sur le paysage (solde, en-tête,
 * périodes) lit cette palette, quel que soit le thème. Texte crème, surfaces
 * de verre translucide : le ciel reste visible à travers.
 */
const sky: Palette = {
  ...dark,
  surface1: 'rgba(255,248,238,0.10)',
  surface2: 'rgba(255,248,238,0.16)',
  surface3: 'rgba(255,248,238,0.22)',
  border: 'rgba(255,248,238,0.16)',
  rim: 'rgba(255,248,238,0.28)',
  text: '#FFF8EE',
  textSecondary: 'rgba(255,248,238,0.80)',
  textTertiary: 'rgba(255,248,238,0.72)',
  primary: '#FFF8EE',
  onPrimary: '#1E1C2A',
  warm: '#FFD2B0',
  up: '#8BF0BE',
  down: '#FFB0A6',
};

function paletteFor(mode: ThemeMode, base?: Palette) {
  const p: Palette = base ?? (mode === 'dark' ? dark : light);
  return {
    ...p,
    // ── Alias hérités (écrans existants) ──
    bg: p.bg,
    bgDeep: p.bg,
    bgElevated: p.surface2,
    card: p.surface1,
    cardBorder: p.border,
    glass: p.surface1,
    glassStrong: p.surface2,
    glassBorder: p.border,
    textMuted: p.textSecondary,
    textFaint: p.textTertiary,
    /** « accent » hérité = la Lumière (bouton principal). Plus de doré/violet. */
    accent: p.primary,
    accentAlt: p.primary,
    violet: p.primary,
    blue: p.primary,
    success: p.up,
  };
}

export type ThemeColors = ReturnType<typeof paletteFor>;

/* ------------------------------------------------------------------ */
/* Construction                                                        */
/* ------------------------------------------------------------------ */

function buildTheme(mode: ThemeMode, base?: Palette) {
  const colors = paletteFor(mode, base);

  /**
   * Dégradés hérités : NEUTRALISÉS (aucun dégradé décoratif, §2.4). Chaque
   * entrée est un aplat (deux fois la même couleur) : les composants qui
   * appellent encore <LinearGradient> rendent une surface unie. Le seul
   * dégradé légitime est `halo` (tokens).
   */
  const flat = (c: string) => [c, c] as const;
  const gradients = {
    screen: [colors.bg, colors.bg, colors.bg] as const,
    accent: flat(colors.primary),
    card: [colors.surface1, colors.surface1, colors.surface1] as const,
    violet: flat(colors.primary),
    sheen: ['rgba(0,0,0,0)', 'rgba(0,0,0,0)'] as const,
  };

  const typography = {
    // ── Variantes de l'échelle (celles du <Text> du kit) ──
    balance: { ...type.balance, color: colors.text },
    display: { ...type.display, color: colors.text },
    title1: { ...type.title1, color: colors.text },
    heading: { ...type.heading, color: colors.text },
    title2: { ...type.title2, color: colors.text },
    body: { ...type.body, color: colors.text },
    bodyStrong: { ...type.bodyStrong, color: colors.text },
    bodySecondary: { ...type.bodySecondary, color: colors.textSecondary },
    label: { ...type.label, color: colors.textSecondary },
    caption: { ...type.caption, color: colors.textSecondary },
    small: { ...type.small, color: colors.textSecondary },
    micro: { ...type.micro, color: colors.textTertiary },
    // ── Alias hérités : mêmes styles sous l'ancien nom ──
    /** @deprecated → `balance`. */
    hero: { ...type.balance, color: colors.text },
    /** @deprecated → `heading`. */
    title: { ...type.heading, color: colors.text },
    /** @deprecated → `title2`. */
    section: { ...type.title2, color: colors.text },
    /** @deprecated → `label`. */
    muted: { ...type.label, color: colors.textSecondary },
    mono: { ...type.caption, fontVariant: type.balance.fontVariant, color: colors.text },
    money: { ...type.bodyStrong, fontVariant: type.balance.fontVariant, color: colors.text },
  } as const;

  /** Ombres : SUPPRIMÉES (§2.4). Conservé pour l'API héritée — objet vide. */
  const shadow = { card: {} } as const;

  return {
    mode,
    colors,
    gradients,
    typography,
    shadow,
    accentGradient: gradients.accent,
    halo: halo[mode],
    /** Teintes des gestes de l'argent (Envoyer, Recevoir, Swap, Gagner, Acheter). */
    tints: tints[mode],
    /** Ombre douce (Crème) ; vide en Nuit. */
    elevation: elevation[mode] as (typeof elevation)['light'] | Record<string, never>,
  };
}

export type Theme = ReturnType<typeof buildTheme>;

const THEMES: Record<ThemeMode, Theme> = { dark: buildTheme('dark'), light: buildTheme('light') };
/** Thème « ciel » : mode sombre (logique), palette de verre sur le paysage. */
const SKY_THEME: Theme = buildTheme('dark', sky);

/** Couleurs du ciel, pour un écran qui dessine lui-même sur le paysage. */
export const skyColors = SKY_THEME.colors;

const Override = createContext<Theme | null>(null);

/** Tout ce qui est rendu à l'intérieur se dessine pour le ciel de l'accueil. */
export function OnSky({ children }: { children: ReactNode }) {
  return createElement(Override.Provider, { value: SKY_THEME }, children);
}

/* ------------------------------------------------------------------ */
/* Hooks                                                               */
/* ------------------------------------------------------------------ */

/** Thème actif : préférence utilisateur, « système » suivant l'OS. Sombre par défaut. */
export function useTheme(): Theme {
  const override = useContext(Override);
  const pref = useSettings((s) => s.themePref);
  const system = useColorScheme();
  const mode: ThemeMode = pref === 'system' ? (system === 'light' ? 'light' : 'dark') : pref;
  return override ?? THEMES[mode];
}

/** Le thème de l'app, en ignorant un éventuel `OnSky` (ce qui sort du ciel). */
export function useAppTheme(): Theme {
  const pref = useSettings((s) => s.themePref);
  const system = useColorScheme();
  const mode: ThemeMode = pref === 'system' ? (system === 'light' ? 'light' : 'dark') : pref;
  return THEMES[mode];
}

export function useColors(): ThemeColors {
  return useTheme().colors;
}
