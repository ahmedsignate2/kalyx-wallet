'use client';

import React, { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from 'framer-motion';
import { ArrowDown } from 'lucide-react';
import type { Dict } from '../../i18n';

/**
 * Ouverture du film. Une phrase de récupération (12 mots BIP-39, exemple) apparaît
 * au fil du défilement, puis se voile : dans l'app, les mots restent masqués tant
 * que le doigt n'est pas posé (app/backup.tsx). L'histoire commence là.
 */
const WORDS = ['ocean', 'planet', 'silent', 'orbit', 'north', 'garden', 'river', 'pulse', 'velvet', 'cradle', 'mirror', 'fossil'];

function Word({ word, index, progress }: { word: string; index: number; progress: MotionValue<number> }) {
  const start = 0.06 + index * 0.035;
  const opacity = useTransform(progress, [start, start + 0.04, 0.62, 0.74], [0, 1, 1, 0.22]);
  const y = useTransform(progress, [start, start + 0.05], [14, 0]);
  const blur = useTransform(progress, [0.6, 0.74], [0, 6]);
  const filter = useTransform(blur, (b) => `blur(${b}px)`);
  return (
    <motion.li style={{ opacity, y, filter }} className="flex items-baseline gap-3 border-b border-bone/10 py-2 sm:py-3">
      <span className="w-6 font-display text-sm text-mist/60">{String(index + 1).padStart(2, '0')}</span>
      <span className="font-display text-xl text-paper sm:text-3xl">{word}</span>
    </motion.li>
  );
}

export function Opening({ t }: { t: Dict }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });

  const titleOpacity = useTransform(scrollYProgress, [0, 0.08], [1, 0]);
  const titleY = useTransform(scrollYProgress, [0, 0.08], [0, -24]);
  const captionOpacity = useTransform(scrollYProgress, [0.7, 0.8, 0.95, 1], [0, 1, 1, 0]);
  const captionY = useTransform(scrollYProgress, [0.7, 0.8], [16, 0]);
  const cueOpacity = useTransform(scrollYProgress, [0, 0.05], [1, 0]);

  if (reduce) {
    return (
      <section className="px-5 pt-32 sm:px-8">
        <p className="mx-auto max-w-3xl text-center font-display text-4xl font-light text-paper">{t.opening.title}</p>
        <p className="mx-auto mt-4 max-w-md text-center font-light text-mist">{t.opening.sub}</p>
      </section>
    );
  }

  return (
    <section ref={ref} aria-label="Ouverture" className="relative h-[260vh]">
      <div className="sticky top-0 flex h-svh items-center justify-center overflow-hidden px-5">
        {/* Titre d'ouverture */}
        <motion.div style={{ opacity: titleOpacity, y: titleY }} className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center">
          <p className="font-display text-[2.6rem] font-light leading-none tracking-[-0.02em] text-paper sm:text-7xl lg:text-8xl">{t.opening.title}</p>
          <p className="mx-auto mt-5 max-w-md px-4 text-base font-light text-mist sm:text-lg">{t.opening.sub}</p>
        </motion.div>

        {/* Les mots */}
        <ul className="grid w-full max-w-2xl -translate-y-8 grid-cols-2 gap-x-6 sm:-translate-y-4 sm:grid-cols-3 sm:gap-x-10" aria-hidden>
          {WORDS.map((w, i) => (
            <Word key={w} word={w} index={i} progress={scrollYProgress} />
          ))}
        </ul>

        {/* Légende finale */}
        <motion.p
          style={{ opacity: captionOpacity, y: captionY }}
          className="absolute inset-x-5 bottom-[12svh] mx-auto max-w-lg text-center text-sm font-light leading-relaxed text-bone sm:bottom-[16svh] sm:text-lg"
        >
          {t.opening.caption}
        </motion.p>

        <motion.p style={{ opacity: cueOpacity }} className="absolute bottom-8 flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-mist/70">
          {t.opening.cue} <ArrowDown className="h-3.5 w-3.5 animate-bounce" />
        </motion.p>
      </div>
    </section>
  );
}
