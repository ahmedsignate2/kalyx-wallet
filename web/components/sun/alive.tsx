'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  animate,
  motion,
  useInView,
  useMotionTemplate,
  useScroll,
  useTransform,
  type MotionValue,
} from 'framer-motion';
import { ArrowDown } from 'lucide-react';
import { EASE } from '../landing/motion';
import { useReducedMotionSafe } from '../landing/reduced-motion';
import type { Dict } from '../../i18n';

/*
 * Ce qui fait vivre le site, dans le style de l'app :
 *  - <Opening>     « Douze mots » : la phrase apparaît au défilement, puis se voile.
 *  - <CountUp>     un chiffre qui compte jusqu'à sa valeur en entrant à l'écran.
 * « Réduire les animations » : tout est rendu à l'état final, sans mouvement.
 */

/* ------------------------------------------------------------------ */
/* Douze mots                                                          */
/* ------------------------------------------------------------------ */

/** Mots d'exemple (liste BIP-39), jamais une vraie phrase. */
const WORDS = ['ocean', 'planet', 'silent', 'orbit', 'north', 'garden', 'river', 'pulse', 'velvet', 'cradle', 'mirror', 'fossil'];

function Word({ word, index, progress }: { word: string; index: number; progress: MotionValue<number> }) {
  const start = 0.08 + index * 0.035;
  const opacity = useTransform(progress, [start, start + 0.04], [0, 1]);
  const y = useTransform(progress, [start, start + 0.05], [18, 0]);
  // Chaque carte se relève comme posée à plat, puis le voile de l'app la recouvre.
  const rotateX = useTransform(progress, [start, start + 0.06], [-80, 0]);
  const veil = useTransform(progress, [0.62, 0.74], [0, 1]);
  const textOpacity = useTransform(veil, [0, 1], [1, 0.12]);
  const blur = useTransform(veil, [0, 1], [0, 7]);
  const filter = useMotionTemplate`blur(${blur}px)`;
  return (
    <motion.li style={{ opacity, y, rotateX, transformPerspective: 700, transformOrigin: '50% 100%' }} className="flex items-baseline gap-2.5 rounded-2xl bg-ink-2 px-4 py-3 shadow-card ring-1 ring-cream-line">
      <span className="w-5 text-xs font-medium text-mist">{index + 1}</span>
      <motion.span style={{ opacity: textOpacity, filter }} className="text-lg font-semibold text-paper sm:text-2xl">
        {word}
      </motion.span>
    </motion.li>
  );
}

export function Opening({ t }: { t: Dict }) {
  const reduce = useReducedMotionSafe();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });

  const titleOpacity = useTransform(scrollYProgress, [0, 0.08], [1, 0]);
  const titleY = useTransform(scrollYProgress, [0, 0.08], [0, -30]);
  const captionOpacity = useTransform(scrollYProgress, [0.72, 0.8, 0.95, 1], [0, 1, 1, 0]);
  const captionY = useTransform(scrollYProgress, [0.72, 0.8], [16, 0]);
  const cueOpacity = useTransform(scrollYProgress, [0, 0.05], [1, 0]);

  if (reduce) {
    return (
      <section className="px-5 py-20 text-center sm:px-8">
        <p className="font-display text-5xl text-paper">{t.opening.title}</p>
        <p className="mx-auto mt-4 max-w-md text-mist">{t.opening.sub}</p>
        <p className="mx-auto mt-6 max-w-lg text-mist">{t.opening.caption}</p>
      </section>
    );
  }

  return (
    <section ref={ref} aria-label={t.opening.title} className="relative h-[250vh]">
      <div className="sticky top-0 flex h-svh items-center justify-center overflow-hidden px-5">
        <motion.div style={{ opacity: titleOpacity, y: titleY }} className="absolute inset-x-0 top-1/2 -translate-y-1/2 px-5 text-center">
          <p className="font-display text-[3rem] leading-none text-paper sm:text-7xl lg:text-8xl">{t.opening.title}</p>
          <p className="mx-auto mt-5 max-w-md text-base text-mist sm:text-lg">{t.opening.sub}</p>
        </motion.div>

        <ul className="grid w-full max-w-2xl grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3" aria-hidden>
          {WORDS.map((w, i) => (
            <Word key={w} word={w} index={i} progress={scrollYProgress} />
          ))}
        </ul>

        <motion.p
          style={{ opacity: captionOpacity, y: captionY }}
          className="absolute inset-x-5 bottom-[10svh] mx-auto max-w-lg text-center text-base font-medium leading-relaxed text-paper sm:bottom-[14svh] sm:text-lg"
        >
          {t.opening.caption}
        </motion.p>

        <motion.p style={{ opacity: cueOpacity }} className="absolute bottom-8 flex items-center gap-2 text-xs font-medium text-mist">
          {t.opening.cue} <ArrowDown className="h-3.5 w-3.5 animate-bounce" aria-hidden />
        </motion.p>
      </div>
    </section>
  );
}

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
