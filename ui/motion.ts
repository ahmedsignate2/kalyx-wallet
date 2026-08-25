/**
 * Nova — Tokens de mouvement (Design System).
 *
 * Ce fichier centralise TOUTES les durées, easings et configs de springs
 * utilisés dans l'app. Aucun écran ne doit inventer ses propres valeurs :
 * importer depuis ici garantit la cohérence de "main" décrite dans le
 * plan de refonte §2.3.2.
 *
 * Règle : chaque animation répond à un état qui change (apparition, succès,
 * erreur, chargement). Jamais d'animation décorative sans raison.
 */
import { Easing, type EasingFunction } from 'react-native';

// ─── Durées ──────────────────────────────────────────────────────────────────

export const duration = {
  /** Feedback de pression (scale bouton, touche PIN). */
  instant: 120,
  /** Micro-interactions (chip, toggle, dot PIN, flash prix). */
  fast: 220,
  /** Entrées de cartes, transitions d'écran. */
  base: 380,
  /** Séquences de succès, révélations importantes. */
  slow: 600,
} as const;

// ─── Easings ─────────────────────────────────────────────────────────────────

export const easing = {
  /** Tout ce qui *apparaît* (entrée d'écran, reveal, fade-in). */
  out: Easing.bezier(0.16, 1, 0.3, 1) as EasingFunction,
  /** Tout ce qui *boucle* (respiration halo, pulse anneau). */
  inOut: Easing.inOut(Easing.sin) as EasingFunction,
  /** Accélération puis plateau — pour les sorties/disparitions. */
  in: Easing.bezier(0.55, 0.055, 0.675, 0.19) as EasingFunction,
} as const;

// ─── Springs (API Animated classique) ────────────────────────────────────────
// Config `spring()` de React Native Animated (speed + bounciness).

export const spring = {
  /**
   * Boutons, dots PIN, chips — réactif, rebond minime.
   * Anciennement éparpillé : PinPad Dot speed 20/bounce 14 → unifié.
   */
  snappy: { speed: 20, bounciness: 6, useNativeDriver: true },
  /**
   * Logo, éléments hero, anneau Nova — plus de présence physique.
   * Anciennement : ShineLogo speed 8/bounce 9 → unifié.
   */
  soft: { speed: 8, bounciness: 10, useNativeDriver: true },
} as const;

// ─── Délais en cascade (listes) ──────────────────────────────────────────────

/** Délai entre chaque élément d'une liste en cascade (home, market, history). */
export const CASCADE_DELAY_MS = 45;

/** Nombre max d'éléments animés en cascade (au-delà, pas de délai). */
export const CASCADE_MAX = 12;

/**
 * Calcule le délai d'un élément dans une cascade.
 * @param index Position dans la liste (0-indexed).
 * @returns Délai en ms (0 si l'index dépasse CASCADE_MAX).
 */
export function cascadeDelay(index: number): number {
  return index < CASCADE_MAX ? index * CASCADE_DELAY_MS : 0;
}

// ─── Utilitaires Reanimated (lazy, ne casse pas si non chargé) ──────────────

/**
 * Config spring Reanimated v3 équivalente aux tokens ci-dessus.
 * Utilisable avec `withSpring(value, reanimatedSpring.snappy)`.
 * À utiliser SEULEMENT dans les composants qui importent déjà reanimated.
 */
export const reanimatedSpring = {
  snappy: { damping: 15, stiffness: 200, mass: 0.6 },
  soft: { damping: 12, stiffness: 80, mass: 1 },
} as const;
