/**
 * KALYX — TOKENS DE DESIGN (source de vérité, cf. Bible design §2 et §3).
 *
 * Tout ce qui est visuel dérive d'ici : couleurs (sombre = principal, clair),
 * halo, typographie (General Sans), grille de 4, rayons hiérarchiques,
 * ressorts d'animation, retours haptiques. Si une valeur n'est pas ici, on
 * ne l'invente pas dans un écran : on l'ajoute ici, puis on l'utilise.
 *
 * Concept : la lumière comme matière, et deux mondes complets — CRÈME (clair,
 * papier chaud) et NUIT (sombre, chaud). Le seul paysage est celui de
 * l'accueil, qui suit l'heure ; ailleurs l'interface reste calme. Chaque geste
 * de l'argent a sa teinte (`tints`), toujours la même. Pas de vert acide, pas
 * de dégradé décoratif hors du ciel et du halo.
 */
import { Platform, type TextStyle } from 'react-native';

/* ------------------------------------------------------------------ */
/* Couleurs                                                            */
/* ------------------------------------------------------------------ */

/**
 * Thème NUIT — sombre, chaud. Le noir n'est pas bleu acier : c'est une nuit
 * d'été, encre tirant vers le brun, blancs légèrement crème. La profondeur
 * vient des niveaux de surface et d'un liseré de lumière en haut des cartes.
 */
export const dark = {
  bg: '#0B0B10', // Nuit
  surface1: '#14151C', // conteneurs
  surface2: '#1C1D26', // sheets, inputs
  surface3: '#262732', // pressé, survol, disques
  border: 'rgba(255,244,230,0.07)',
  /** Liseré du HAUT des cartes : la lumière d'en haut accroche l'arête, la carte prend du volume. */
  rim: 'rgba(255,244,230,0.13)',
  text: '#F5F1EA',
  textSecondary: '#A29D95',
  textTertiary: '#6E6A63',
  primary: '#F6EEE2', // bouton principal : une lumière crème
  onPrimary: '#0B0B10',
  /** Accent chaud (pêche) : sélection, lien, point actif. L'or reste au logo seul. */
  warm: '#F2A274',
  up: '#3CD98A',
  down: '#FF6B5E',
  warning: '#FFB547',
  danger: '#FF4D5E',
} as const;

export type Palette = { [K in keyof typeof dark]: string };

/**
 * Thème CRÈME — clair, chaud, papier. Jamais de blanc pur en fond : un crème
 * qui fatigue moins l'œil, des cartes un ton plus claires qui se détachent par
 * la lumière, une encre presque noire (bleu nuit) pour l'action principale.
 */
export const light: Palette = {
  bg: '#F4EEE5',
  surface1: '#FFFBF5',
  surface2: '#EFE7DB',
  surface3: '#E6DCCC',
  border: 'rgba(70,48,24,0.09)',
  rim: 'rgba(255,255,255,0.9)',
  text: '#1D1A16',
  textSecondary: '#6B6358',
  textTertiary: '#9A9083',
  primary: '#1E1C2A',
  onPrimary: '#FFF8EE',
  /** Accent chaud (terracotta) : sélection, lien, point actif. */
  warm: '#BC5A2A',
  up: '#16884F',
  down: '#D2443A',
  warning: '#A8680E',
  danger: '#C9303F',
};

/**
 * TEINTES D'ACTION — chaque geste de l'argent a sa couleur, la même partout
 * (accueil, éventail, activité) : on reconnaît l'action avant de lire le mot.
 * Pastel en Crème, lueur translucide en Nuit ; `ink` est l'icône posée dessus.
 */
export type ActionTint = 'send' | 'receive' | 'swap' | 'earn' | 'buy';
export const tints: Record<'dark' | 'light', Record<ActionTint, { bg: string; ink: string }>> = {
  light: {
    send: { bg: '#FBE2D2', ink: '#C4552A' },
    receive: { bg: '#D9EEE3', ink: '#257F5A' },
    swap: { bg: '#E6E0F6', ink: '#6450BE' },
    earn: { bg: '#F5E7C8', ink: '#9A6C12' },
    buy: { bg: '#DCE7F6', ink: '#2F64B0' },
  },
  dark: {
    send: { bg: 'rgba(244,150,104,0.15)', ink: '#F6A982' },
    receive: { bg: 'rgba(84,204,152,0.14)', ink: '#72D9AC' },
    swap: { bg: 'rgba(160,140,250,0.16)', ink: '#B9ABFF' },
    earn: { bg: 'rgba(221,181,101,0.16)', ink: '#E6C682' },
    buy: { bg: 'rgba(110,160,240,0.15)', ink: '#9DBEF5' },
  },
};

/**
 * LE CIEL — le paysage de l'accueil suit l'heure de l'utilisateur : aube,
 * jour, crépuscule, nuit. Trois arrêts de ciel (haut → horizon), le soleil
 * (ou la lune) et trois plans de dunes, du plus lointain au plus proche. Le
 * texte posé dessus est toujours clair : chaque ciel est assez profond en haut.
 */
export type SkyPhase = 'dawn' | 'day' | 'dusk' | 'night';
export const skies: Record<SkyPhase, { sky: readonly [string, string, string]; sun: string; dunes: readonly [string, string, string] }> = {
  dawn: { sky: ['#2B2A4A', '#8C5C7E', '#F2A88A'], sun: '#FFD9B0', dunes: ['#B0687A', '#7A4566', '#47304F'] },
  day: { sky: ['#2C4A73', '#5F87B0', '#E9C79C'], sun: '#FFF1D6', dunes: ['#C98E6A', '#9A6450', '#5E3E3E'] },
  dusk: { sky: ['#1E1D3A', '#6B4A78', '#F09A6E'], sun: '#FFC58A', dunes: ['#A85A66', '#6E3D5C', '#3A2945'] },
  night: { sky: ['#07070F', '#191A36', '#3A3058'], sun: '#E9E4FF', dunes: ['#2E2848', '#211D36', '#141224'] },
};
export const skyPhaseAt = (hour: number): SkyPhase => (hour >= 5 && hour < 9 ? 'dawn' : hour < 17 && hour >= 9 ? 'day' : hour >= 17 && hour < 21 ? 'dusk' : 'night');

/**
 * Ombre douce, en Crème seulement (une ombre ne se lit pas sur la Nuit : là,
 * c'est le liseré qui donne le volume). Brune et diffuse, jamais grise.
 * À poser sur un élément SANS `overflow: hidden` (iOS ne la dessinerait pas).
 */
export const elevation = {
  light: { shadowColor: '#5A3A18', shadowOpacity: 0.1, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  dark: {},
} as const;

/**
 * LE HALO — seul dégradé autorisé de l'app. Radial : blanc au centre → glacier
 * → frange chaude à 30 % → transparent. Utilisé UNIQUEMENT derrière le solde,
 * sur l'écran de succès d'envoi et dans l'onboarding. En clair : opacité ÷ 2.
 */
export const halo = {
  dark: {
    /*
     * Frange en OR de la marque, opaque : le composant lui applique déjà son
     * opacité (0,3). Avec une couleur à 30 % en plus, la frange tombait à 9 %
     * — invisible — et le halo rendait comme une tache grise sur l'Encre.
     */
    stops: ['#FFFFFF', '#D3E4FF', '#DDB565', 'rgba(221,181,101,0)'] as const,
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

/** Graisses : sur Android, la graisse EST la famille (voir ci-dessus). */
export const fontWeight = fontFamily;

/**
 * Police à chasse fixe (adresses, clés, journaux techniques). `'monospace'`
 * n'existe PAS sur iOS : le texte retombait sur la police système
 * proportionnelle, sans avertissement. Menlo est livrée avec iOS.
 */
export const monoFont = Platform.select({ ios: 'Menlo', default: 'monospace' });

/** Chiffres à largeur fixe : les montants s'alignent au pixel. */
export const tabularNums: NonNullable<TextStyle['fontVariant']> = ['tabular-nums'];

/**
 * ÉCHELLE DES TAILLES — les seules tailles de police de l'app. Une taille qui
 * n'est pas ici n'existe pas : on prend la plus proche, on n'en invente pas.
 */
export const fontSize = {
  xxs: 11,
  xs: 12,
  sm: 13,
  md: 14,
  base: 15,
  lg: 16,
  xl: 18,
  xxl: 20,
  h3: 24,
  h2: 28,
  h1: 34,
  display: 48,
} as const;
export type FontSizeToken = keyof typeof fontSize;

/** Interligne associé à chaque taille (≈ ×1,3 en texte courant, plus serré en titre). */
export const lineHeight: Record<FontSizeToken, number> = {
  xxs: 14,
  xs: 16,
  sm: 18,
  md: 20,
  base: 20,
  lg: 22,
  xl: 24,
  xxl: 26,
  h3: 30,
  h2: 34,
  h1: 40,
  display: 52,
};

/** Taille + interligne d'un cran de l'échelle, à étaler dans un style. */
export const textSize = (k: FontSizeToken) => ({ fontSize: fontSize[k], lineHeight: lineHeight[k] });

/**
 * Styles de texte (taille / interligne / graisse / approche), tous bâtis sur
 * l'échelle ci-dessus. Ce sont les variantes du `<Text>` du kit.
 */
export const type = {
  balance: { ...textSize('display'), fontFamily: fontWeight.semibold, letterSpacing: -1.5, fontVariant: tabularNums },
  display: { ...textSize('h1'), fontFamily: fontWeight.semibold, letterSpacing: -0.8, fontVariant: tabularNums },
  title1: { ...textSize('h2'), fontFamily: fontWeight.semibold, letterSpacing: -0.6 },
  heading: { ...textSize('h3'), fontFamily: fontWeight.semibold, letterSpacing: -0.6 },
  title2: { ...textSize('xxl'), fontFamily: fontWeight.semibold, letterSpacing: -0.3 },
  body: { ...textSize('lg'), fontFamily: fontWeight.medium, letterSpacing: 0 },
  bodyStrong: { ...textSize('lg'), fontFamily: fontWeight.semibold, letterSpacing: 0 },
  bodySecondary: { ...textSize('base'), fontFamily: fontWeight.regular, letterSpacing: 0 },
  label: { ...textSize('md'), fontFamily: fontWeight.regular, letterSpacing: 0 },
  caption: { ...textSize('sm'), fontFamily: fontWeight.medium, letterSpacing: 0 },
  small: { ...textSize('xs'), fontFamily: fontWeight.medium, letterSpacing: 0 },
  micro: { ...textSize('xxs'), fontFamily: fontWeight.semibold, letterSpacing: 0.2 },
} as const;

/** Le solde ne doit pas casser la mise en page avec la taille système. */
export const BALANCE_MAX_FONT_SCALE = 1.3;

/* ------------------------------------------------------------------ */
/* Espacement — grille de 4                                            */
/* ------------------------------------------------------------------ */

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 14: 56, 18: 72 } as const;

/** Les mêmes crans, nommés : `spaces.md` se lit mieux que `space[3]` dans un écran. */
export const spaces = {
  xxs: 2,
  xs: space[1],
  sm: space[2],
  md: space[3],
  lg: space[4],
  xl: space[5],
  xxl: space[6],
  xxxl: space[8],
} as const;
export const SCREEN_MARGIN = spaces.xl;
export const TOKEN_ROW_HEIGHT = 64;
export const TOUCH_MIN = 48;

/* ------------------------------------------------------------------ */
/* Rayons — hiérarchiques                                              */
/* ------------------------------------------------------------------ */

/** L'échelle : les seuls rayons de l'app. `full` = pilule ou cercle (côté ÷ 2 inutile). */
export const radii = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 20,
  xl: 24,
  xxl: 28,
  full: 999,
} as const;

/** Le même rayon, nommé par son rôle. */
export const radius = {
  chip: radii.sm, // chips, badges
  input: radii.md, // inputs, boutons secondaires
  button: radii.lg, // bouton principal (hauteur 58) — Nova
  container: radii.xl, // conteneurs — Nova
  sheet: radii.xxl, // bottom sheets (haut)
  round: radii.full, // avatars, glyphes
} as const;
export const BUTTON_HEIGHT = 58;

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
 * 3. UNE SEULE animation ambiante par écran, et c'est le halo.
 *    EXCEPTION, et une seule : l'écran de BIENVENUE. C'est une vitrine, pas un
 *    outil — l'utilisateur n'y fait rien, il décide s'il installe l'app. Rainbow
 *    y fait flotter ses pièces, Phantom tout un univers ; un écran figé à cet
 *    endroit précis se lit comme un produit mort. Y sont donc autorisés, et
 *    NULLE PART ailleurs : le soleil vivant (onde de couronne + balancement),
 *    trois éclats qui dérivent, et le reflet sur l'action principale. Dès
 *    l'écran suivant, la règle redevient stricte : sur un écran où l'on manipule
 *    de l'argent, une animation qui bouge toute seule est un parasite. Rien d'autre ne
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
// - En Nuit, la profondeur vient des surfaces, pas des ombres : ZÉRO ombre.
//   En Crème, une seule ombre, `elevation.light`, douce et brune.
// - Aucun dégradé ailleurs que le ciel de l'accueil et le halo. Aucun emoji. Aucun label en majuscules.
// - Listes : une carte par GROUPE, jamais une carte par ligne.
