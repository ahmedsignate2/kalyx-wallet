'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  animate,
  useInView,
} from 'framer-motion';
import { EASE } from '../landing/motion';
import { useReducedMotionSafe } from '../landing/reduced-motion';

/*
 * Ce qui fait vivre le site, dans le style de l'app :
 *  - <CountUp>     un chiffre qui compte jusqu'à sa valeur en entrant à l'écran.
 * « Réduire les animations » : tout est rendu à l'état final, sans mouvement.
 */

/* ------------------------------------------------------------------ */
/* Chiffres qui comptent                                               */
/* ------------------------------------------------------------------ */

/** Compte jusqu'à la partie numérique de `value` (« 190+ », « 65 »…), le reste est gardé tel quel. */
export function CountUp({ value, className = '' }: { value: string; className?: string }) {
  const reduce = useReducedMotionSafe();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -10% 0px' });
  const m = value.match(/^(\D*)(\d+)(.*)$/);
  const target = m ? Number(m[2]) : 0;
  const [n, setN] = useState(target);
  useEffect(() => {
    if (!m || reduce) return;
    setN(0);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!m || reduce || !inView) return;
    const c = animate(0, target, { duration: 1.6, ease: EASE, onUpdate: (v) => setN(Math.round(v)) });
    return () => c.stop();
  }, [inView]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!m) return <span className={className}>{value}</span>;
  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {m[1]}
      {n}
      {m[3]}
    </span>
  );
}
