/**
 * KALYX — TOKENS DE DESIGN (source de vérité, cf. Bible design §2 et §3).
 *
 * Tout ce qui est visuel dérive d'ici : couleurs (sombre = principal, clair),
 * halo, typographie (General Sans), grille de 4, rayons hiérarchiques,
 * ressorts d'animation, retours haptiques. Si une valeur n'est pas ici, on
 * ne l'invente pas dans un écran : on l'ajoute ici, puis on l'utilise.
 *
 * Concept : la lumière comme matière. Interface sombre, presque monochrome ;
 * la seule chose qui brille est le halo derrière le solde et les moments où
 * l'argent bouge. Pas de violet, pas de bleu roi, pas d'orange, pas de vert acide.
 */
import type { TextStyle } from 'react-native';

/* ------------------------------------------------------------------ */
/* Couleurs                                                            */
/* ------------------------------------------------------------------ */

/** Thème SOMBRE — thème principal. Noms de la bible entre parenthèses. */
export const dark = {
  bg: '#06070D', // Encre
  surface1: '#0E1019', // Nuit — conteneurs
  surface2: '#161926', // Orbite — sheets, inputs
  surface3: '#1F2333', // Crépuscule — pressé, hover
  border: 'rgba(255,255,255,0.07)', // Trait
  text: '#F2F4FA', // Lueur
  textSecondary: '#9499AB', // Brume
  textTertiary: '#5D6275', // Cendre
  primary: '#F4F6FF', // Lumière — bouton principal
  onPrimary: '#06070D', // texte sur Lumière
  up: '#3CD98A',
  down: '#FF6363',
  warning: '#FFB547',
  danger: '#FF4D5E',
} as const;

export type Palette = { [K in keyof typeof dark]: string };

/** Thème CLAIR — mêmes rôles. */
export const light: Palette = {
  bg: '#F6F7FA',
  surface1: '#FFFFFF',
  surface2: '#EEF0F5',
  surface3: '#E4E7EF',
  border: 'rgba(6,7,13,0.08)',
  text: '#0B0D16',
  textSecondary: '#5A6072',
  textTertiary: '#9097A8',
  primary: '#0B0D16',
  onPrimary: '#FFFFFF',
  up: '#13A15E',
  down: '#E23B3B',
  warning: '#B8791A',
  danger: '#D93444',
};

/**
 * LE HALO — seul dégradé autorisé de l'app. Radial : blanc au centre → glacier
 * → frange chaude à 30 % → transparent. Utilisé UNIQUEMENT derrière le solde,
 * sur l'écran de succès d'envoi et dans l'onboarding. En clair : opacité ÷ 2.
 */
export const halo = {
  dark: {
    stops: ['#FFFFFF', '#CFE3FF', 'rgba(255,217,184,0.30)', 'rgba(255,217,184,0)'] as const,
    positions: [0, 0.35, 0.7, 1] as const,
    opacity: 1,
  },
  light: {
    stops: ['#FFFFFF', '#DCEBFF', 'rgba(255,205,160,0.30)', 'rgba(255,205,160,0)'] as const,
    positions: [0, 0.35, 0.7, 1] as const,
    opacity: 0.5,
  },
} as const;

/* ------------------------------------------------------------------ */
/* Typographie — General Sans (Fontshare, ITF Free Font License)       */
/* ------------------------------------------------------------------ */

/**
 * Sur Android une fontFamily custom ignore fontWeight : on nomme le FICHIER de
 * graisse. Chargées dans app/_layout.tsx depuis assets/fonts.
 */
export const fontFamily = {
  regular: 'GeneralSans-Regular',
  medium: 'GeneralSans-Medium',
  semibold: 'GeneralSans-Semibold',
  bold: 'GeneralSans-Bold',
} as const;

/** Chiffres à largeur fixe : les montants s'alignent au pixel. */
export const tabularNums: NonNullable<TextStyle['fontVariant']> = ['tabular-nums'];

/** Échelle typographique (taille / interligne / graisse / approche). */
export const type = {
  balance: { fontSize: 48, lineHeight: 52, fontFamily: fontFamily.semibold, letterSpacing: -1.5, fontVariant: tabularNums },
  title1: { fontSize: 28, lineHeight: 34, fontFamily: fontFamily.semibold, letterSpacing: -0.6 },
  title2: { fontSize: 20, lineHeight: 26, fontFamily: fontFamily.semibold, letterSpacing: -0.3 },
  body: { fontSize: 16, lineHeight: 22, fontFamily: fontFamily.medium, letterSpacing: 0 },
  bodySecondary: { fontSize: 15, lineHeight: 20, fontFamily: fontFamily.regular, letterSpacing: 0 },
  caption: { fontSize: 13, lineHeight: 18, fontFamily: fontFamily.medium, letterSpacing: 0 },
  micro: { fontSize: 11, lineHeight: 14, fontFamily: fontFamily.semibold, letterSpacing: 0.2 },
} as const;

/** Le solde ne doit pas casser la mise en page avec la taille système. */
export const BALANCE_MAX_FONT_SCALE = 1.3;

/* ------------------------------------------------------------------ */
/* Espacement — grille de 4                                            */
/* ------------------------------------------------------------------ */

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 14: 56, 18: 72 } as const;
export const SCREEN_MARGIN = 20;
export const TOKEN_ROW_HEIGHT = 64;
export const TOUCH_MIN = 48;

/* ------------------------------------------------------------------ */
/* Rayons — hiérarchiques                                              */
/* ------------------------------------------------------------------ */

export const radius = {
  chip: 8, // chips, badges
  input: 12, // inputs, boutons secondaires
  button: 18, // bouton principal (hauteur 56)
  container: 22, // conteneurs
  sheet: 28, // bottom sheets (haut)
  round: 999, // avatars, glyphes
} as const;
export const BUTTON_HEIGHT = 56;

/* ------------------------------------------------------------------ */
/* Mouvement — ressorts Reanimated `withSpring`                        */
/* ------------------------------------------------------------------ */

export const springs = {
  /** Appui, toggles, chips. */
  snappy: { damping: 20, stiffness: 400 },
  /** Sheets, navigation. */
  standard: { damping: 22, stiffness: 220 },
  /** Halo, gros éléments. */
  gentle: { damping: 26, stiffness: 120 },
} as const;

export const durations = {
  fade: 150,
  micro: 120,
  themeCrossfade: 250,
  holdToSend: 1200,
  burst: 700,
  haloBreath: 6000,
} as const;

/** Appui sur un bouton : scale 0.96, jamais de changement d'opacité. */
export const PRESS_SCALE = 0.96;

/* ------------------------------------------------------------------ */
/* Haptique — quel retour pour quel moment (§3.3)                      */
/* ------------------------------------------------------------------ */

export const hapticFor = {
  tabChange: 'selection',
  segmentChange: 'selection',
  chartScrub: 'selection',
  copyAddress: 'light',
  tapMax: 'light',
  holdToSendDone: 'heavy',
  txConfirmed: 'success',
  riskAlertOpen: 'warning',
  error: 'error',
} as const;

/* ------------------------------------------------------------------ */
/* Règles (rappel, cf. §2.4, §13)                                      */
/* ------------------------------------------------------------------ */
// - La couleur n'est jamais la seule information (signe + flèche + couleur).
// - En sombre, la profondeur vient des surfaces, pas des ombres : ZÉRO ombre.
// - Aucun dégradé ailleurs que le halo. Aucun emoji. Aucun label en majuscules.
// - Listes : une carte par GROUPE, jamais une carte par ligne.
