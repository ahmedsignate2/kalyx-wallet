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
  /*
   * En thème clair, un halo BLANC à 50 % d'opacité sur un fond #F6F7FA est
   * rigoureusement invisible — le halo n'arrivait pas « trop tard », il
   * n'arrivait jamais. Sur le Papier, la lueur doit être l'or de la marque :
   * c'est le seul pigment qui se lit sur un fond presque blanc.
   */
  light: {
    stops: ['rgba(221,181,101,0.62)', 'rgba(221,181,101,0.34)', 'rgba(184,134,58,0.18)', 'rgba(184,134,58,0)'] as const,
    positions: [0, 0.35, 0.7, 1] as const,
    opacity: 1,
  },
} as const;

/**
 * Or de la marque. Volontairement HORS palette : c'est une identité, pas une
 * couleur d'interface — le logo est le même or sur l'Encre et sur le Papier.
 */
export const BRAND_GOLD = { light: '#DDB565', deep: '#B8863A' } as const;

/**
 * Particules du lancement. Elles doivent se lire SUR le fond : de la lumière
 * qui converge sur l'Encre, de l'encre qui converge sur le Papier. Des
 * particules blanches sur #F6F7FA ne sont pas « discrètes », elles sont
 * absentes — c'est ce qui rendait l'ouverture muette en thème clair.
 */
export const splashParticles = {
  dark: ['#FFFFFF', '#CFE3FF', '#FFD9B8', '#E6EEFF'] as const,
  light: ['#0B0D16', '#2E3A57', '#8A6A2E', '#3F4A66'] as const,
} as const;

/** Traînée qui traverse l'écran : or clair sur l'Encre, or profond sur le Papier. */
export const splashSweep = {
  dark: 'rgba(221,181,101,0.55)',
  light: 'rgba(138,106,46,0.34)',
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

/**
 * DOCTRINE D'ANIMATION — une seule règle, valable partout. À lire avant
 * d'ajouter le moindre mouvement (les exceptions se discutent, ne s'inventent
 * pas) :
 *
 * 1. UNE animation répond à UNE action de l'utilisateur. Si on ne peut pas
 *    nommer le geste qu'elle confirme, elle ne doit pas exister.
 * 2. JAMAIS de cascade (stagger) sur une liste de données. C'est la signature
 *    d'une interface bâclée et ça donne une sensation de lag au scroll. Une
 *    apparition décalée est tolérée UNE fois, au tout premier affichage d'une
 *    liste courte et figée (les 3 arguments de Welcome) — jamais au re-render,
 *    jamais au scroll, jamais sur les tokens / l'activité / le marché.
 * 3. UNE SEULE animation ambiante par écran, et c'est le halo. Rien d'autre ne
 *    bouge tout seul : pas d'icône qui pulse, pas de bouton qui respire.
 * 4. Ressort plutôt que durée : `withSpring(springs.*)` par défaut,
 *    `withTiming` seulement pour un fondu pur.
 * 5. Rien ne bloque : l'utilisateur peut toucher un élément dès qu'il est
 *    visible, même si son animation d'entrée n'est pas finie.
 * 6. Chaque appui a un retour VISUEL (scale) et TACTILE (haptique légère).
 * 7. `useReducedMotion()` est respecté à 100 % : tout reste visible et
 *    utilisable, seul le mouvement disparaît.
 */
export const springs = {
  /** Appui, toggles, chips. */
  snappy: { damping: 20, stiffness: 400 },
  /** Sheets, navigation. */
  standard: { damping: 22, stiffness: 220 },
  /** Halo, gros éléments. */
  gentle: { damping: 26, stiffness: 120 },
  /** Réussite (coche, succès d'envoi) : léger rebond, jamais ailleurs. */
  bouncy: { damping: 12, stiffness: 260 },
  /**
   * Allumage d'un rayon du logo, et RIEN d'autre. Chaque rayon jaillit du
   * noyau en dépassant légèrement sa longueur avant de se poser : c'est ce
   * dépassement, répété seize fois en cascade, qui fait la sensation de
   * construction. Un `withTiming` linéaire donnait un fondu, pas un jaillissement.
   */
  ignite: { damping: 14, stiffness: 180 },
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
