'use client';

import React from 'react';
import { motion, useReducedMotion, type Variants } from 'framer-motion';

/**
 * Vocabulaire d'animation du site (éditorial : lent, sans rebond, une seule courbe).
 *  - <Reveal>  : fondu + montée quand l'élément entre à l'écran (une seule fois).
 *  - <Stagger> : conteneur qui décale ses <Item> enfants (cartes, listes).
 *  - <Rule>    : filet qui se trace de gauche à droite (les intertitres « Acte »).
 * « Réduire les animations » : tout est rendu directement, sans transition.
 */
export const EASE = [0.22, 1, 0.36, 1] as const;

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.9, ease: EASE } },
};

const viewport = { once: true, margin: '0px 0px -10% 0px' } as const;

export function Reveal({
  children,
  delay = 0,
  className = '',
  as = 'div',
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  as?: 'div' | 'p' | 'li' | 'h2' | 'article';
}) {
  const reduce = useReducedMotion();
  const Tag = motion[as];
  if (reduce) {
    const Plain = as;
    return <Plain className={className}>{children}</Plain>;
  }
  return (
    <Tag
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={viewport}
      variants={{ ...fadeUp, show: { ...fadeUp.show, transition: { duration: 0.9, ease: EASE, delay } } }}
    >
      {children}
    </Tag>
  );
}

export function Stagger({
  children,
  className = '',
  gap = 0.08,
  as = 'div',
}: {
  children: React.ReactNode;
  className?: string;
  gap?: number;
  as?: 'div' | 'ol' | 'ul';
}) {
  const reduce = useReducedMotion();
  const Tag = motion[as];
  if (reduce) {
    const Plain = as;
    return <Plain className={className}>{children}</Plain>;
  }
  return (
    <Tag
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={viewport}
      variants={{ hidden: {}, show: { transition: { staggerChildren: gap } } }}
    >
      {children}
    </Tag>
  );
}

/** `lift` : léger soulèvement au survol (via framer, car il pilote déjà `transform`). */
export function Item({
  children,
  className = '',
  as = 'div',
  lift = false,
}: {
  children: React.ReactNode;
  className?: string;
  as?: 'div' | 'li' | 'article';
  lift?: boolean;
}) {
  const reduce = useReducedMotion();
  const Tag = motion[as];
  if (reduce) {
    const Plain = as;
    return <Plain className={className}>{children}</Plain>;
  }
  return (
    <Tag
      className={className}
      variants={fadeUp}
      whileHover={lift ? { y: -4, transition: { duration: 0.3, ease: EASE } } : undefined}
    >
      {children}
    </Tag>
  );
}

/** Filet horizontal qui se trace ; `className` porte la couleur et la largeur. */
export function Rule({ className = '', delay = 0 }: { className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  if (reduce) return <span className={`h-px ${className}`} />;
  return (
    <motion.span
      className={`h-px origin-left ${className}`}
      initial={{ scaleX: 0 }}
      whileInView={{ scaleX: 1 }}
      viewport={viewport}
      transition={{ duration: 1.1, ease: EASE, delay }}
    />
  );
}
