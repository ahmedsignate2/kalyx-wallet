/**
 * Réglage système « réduire les animations », source unique.
 *
 * Il était suivi dans `lib/haptics`, pour les haptiques seulement, et gardé
 * privé. Les ANIMATIONS l'ignoraient donc complètement : une cascade de douze
 * lignes reste désagréable pour qui a demandé au système de calmer le mouvement,
 * et ce réglage n'existe pas pour être contourné.
 *
 * Un seul écouteur pour toute l'app : deux modules qui s'abonnent séparément au
 * même événement finissent par divergent quand l'un oublie de se désabonner.
 */
import { AccessibilityInfo } from 'react-native';
import { useEffect, useState } from 'react';

let enabled = false;
const listeners = new Set<(v: boolean) => void>();

function set(v: boolean) {
  if (v === enabled) return;
  enabled = v;
  for (const l of listeners) l(v);
}

// L'API peut être absente selon la plateforme : on interroge de façon gardée.
AccessibilityInfo.isReduceMotionEnabled?.()
  ?.then(set)
  ?.catch(() => {});
AccessibilityInfo.addEventListener?.('reduceMotionChanged', set);

/** Lecture immédiate, hors composant (haptiques, calculs de durée). */
export function reduceMotionEnabled(): boolean {
  return enabled;
}

/** Version réactive, pour un composant qui doit se redessiner au changement. */
export function useReduceMotion(): boolean {
  const [v, setV] = useState(enabled);
  useEffect(() => {
    listeners.add(setV);
    // L'état peut avoir changé entre le premier rendu et cet effet.
    setV(enabled);
    return () => {
      listeners.delete(setV);
    };
  }, []);
  return v;
}
