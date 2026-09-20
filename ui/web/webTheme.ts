/**
 * Palette + typo de la maquette « Accueil » du tableau de bord web (mobile /
 * Telegram). Volontairement séparée de `ui/theme.ts` : l'app mobile est en
 * production et ne doit pas bouger — ici on reproduit fidèlement la maquette
 * validée (laiton #C89B5C, Space Grotesk pour les chiffres, IBM Plex Sans
 * pour le reste) sans toucher aux tokens partagés.
 */
import { useEffect } from 'react';
import { useTheme } from '../theme';

export const WEB_PALETTE = {
  bg: '#0B0C0E',
  surface: '#15171B',
  surfaceHi: '#1F2227',
  border: '#2A2D33',
  divider: '#1C1F24',
  text: '#F5F6F7',
  text2: '#E5E7EB',
  muted: '#9AA0AB',
  faint: '#6B7280',
  accent: '#C89B5C',
  onAccent: '#171310',
  up: '#34D399',
  down: '#F87171',
} as const;

export type WebPalette = { [K in keyof typeof WEB_PALETTE]: string };

/** Web uniquement (react-native-web transmet fontFamily/fontWeight au CSS). */
export const WEB_FONTS = {
  display: 'Space Grotesk, GeneralSans-Semibold, sans-serif',
  body: 'IBM Plex Sans, GeneralSans-Regular, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
} as const;

const GOOGLE_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap';

/** Injecte une seule fois la feuille Google Fonts dans <head>. No-op hors web. */
export function useWebFonts() {
  useEffect(() => {
    // Pas de lib DOM dans le tsconfig (ciblé mobile) : forme minimale typée à la main.
    type MinimalDoc = {
      querySelector: (sel: string) => unknown;
      createElement: (tag: string) => { rel: string; href: string; setAttribute: (k: string, v: string) => void };
      head: { appendChild: (el: unknown) => void };
    };
    const doc = (globalThis as { document?: MinimalDoc }).document;
    if (!doc || doc.querySelector('link[data-kalyx-fonts]')) return;
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = GOOGLE_FONTS_HREF;
    link.setAttribute('data-kalyx-fonts', '1');
    doc.head.appendChild(link);
  }, []);
}

/** Maquette = thème sombre. En clair (préférence utilisateur), on retombe sur
 *  les couleurs du thème pour rester lisible, en gardant l'accent laiton. */
export function useWebPalette(): WebPalette {
  const { mode, colors } = useTheme();
  if (mode === 'dark') return WEB_PALETTE;
  return {
    bg: colors.bg,
    surface: colors.surface1,
    surfaceHi: colors.surface2,
    border: colors.border,
    divider: colors.border,
    text: colors.text,
    text2: colors.text,
    muted: colors.textSecondary,
    faint: colors.textTertiary,
    accent: WEB_PALETTE.accent,
    onAccent: WEB_PALETTE.onAccent,
    up: colors.up,
    down: colors.down,
  };
}
