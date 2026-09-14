'use client';

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * Apparition d'une section quand elle entre dans l'écran : fondu + 12 px de
 * montée, une seule fois, courbe du ressort Doux. Rien ne « glisse sans raison » :
 * l'entrée à l'écran est l'action. « Réduire les animations » → rendu direct.
 */
export function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -12% 0px' }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
