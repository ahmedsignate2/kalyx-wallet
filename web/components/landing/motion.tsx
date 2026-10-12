'use client';

import React from 'react';
import { motion, useMotionTemplate, useMotionValue, useSpring, type Variants } from 'framer-motion';
import { useReducedMotionSafe } from './reduced-motion';

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
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  as?: 'div' | 'p' | 'li' | 'h2' | 'article';
  style?: React.CSSProperties;
}) {
  const reduce = useReducedMotionSafe();
  const Tag = motion[as];
  if (reduce) {
    const Plain = as;
    return (
      <Plain className={className} style={style}>
        {children}
      </Plain>
    );
  }
  return (
    <Tag
      className={className}
      style={style}
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
  const reduce = useReducedMotionSafe();
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

/** Ressort des bascules 3D : suit la souris sans traîner, se pose sans rebond visible. */
export const TILT_SPRING = { stiffness: 170, damping: 20, mass: 0.6 } as const;

/**
 * Carte qui s'incline en 3D vers la souris, avec un reflet qui glisse sur sa surface.
 * Souris uniquement : au doigt, l'inclinaison gênerait le défilement.
 */
export function Tilt({ children, className = '', max = 7 }: { children: React.ReactNode; className?: string; max?: number }) {
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const gx = useMotionValue(50);
  const gy = useMotionValue(50);
  const shine = useMotionValue(0);
  const rotateX = useSpring(rx, TILT_SPRING);
  const rotateY = useSpring(ry, TILT_SPRING);
  const opacity = useSpring(shine, TILT_SPRING);
  const glare = useMotionTemplate`radial-gradient(circle at ${gx}% ${gy}%, rgba(243, 239, 230, 0.09), transparent 60%)`;

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== 'mouse') return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    ry.set((px - 0.5) * 2 * max);
    rx.set(-(py - 0.5) * 2 * max);
    gx.set(px * 100);
    gy.set(py * 100);
    shine.set(1);
  }
  function onPointerLeave() {
    rx.set(0);
    ry.set(0);
    shine.set(0);
  }

  return (
    <motion.div
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      style={{ rotateX, rotateY, transformPerspective: 1100, transformStyle: 'preserve-3d' }}
      className={`relative h-full will-change-transform ${className}`}
    >
      {children}
      <motion.span aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit]" style={{ background: glare, opacity }} />
    </motion.div>
  );
}

/**
 * `lift` : léger soulèvement au survol (via framer, car il pilote déjà `transform`).
 * `tilt` : la carte s'incline en 3D vers la souris (`className` passe sur la carte inclinée).
 */
export function Item({
  children,
  className = '',
  as = 'div',
  lift = false,
  tilt = false,
}: {
  children: React.ReactNode;
  className?: string;
  as?: 'div' | 'li' | 'article';
  lift?: boolean;
  tilt?: boolean;
}) {
  const reduce = useReducedMotionSafe();
  const Tag = motion[as];
  if (reduce) {
    const Plain = as;
    return <Plain className={className}>{children}</Plain>;
  }
  if (tilt) {
    return (
      <Tag variants={fadeUp} className="h-full">
        <Tilt className={className}>{children}</Tilt>
      </Tag>
    );
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
  const reduce = useReducedMotionSafe();
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
