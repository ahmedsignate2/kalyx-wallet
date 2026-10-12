'use client';

import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

/**
 * « Réduire les animations », lu APRÈS le montage. La préférence n'existe qu'au
 * navigateur : le HTML exporté rend toujours la version animée. La lire dès le
 * premier rendu donnait un balisage différent du serveur (erreur d'hydratation
 * React #418) chez chaque visiteur qui réduit les animations.
 */
export function useReducedMotionSafe(): boolean {
  const prefers = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted && !!prefers;
}
