'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  animate,
  motion,
  useInView,
  useMotionTemplate,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from 'framer-motion';
import { ArrowDown } from 'lucide-react';
import { Mark } from '../landing/mark';
import { EASE, TILT_SPRING } from '../landing/motion';
import { useReducedMotionSafe } from '../landing/reduced-motion';
import type { Dict } from '../../i18n';

/*
 * Ce qui fait vivre le site, dans le style de l'app :
 *  - <Intro>       rideau d'ouverture : le soleil Kalyx se déploie, puis le ciel se lève (100 % CSS).
 *  - <Progress>    fil d'or sous la barre + rail des sections (grands écrans).
 *  - <Opening>     « Douze mots » : la phrase apparaît au défilement, puis se voile.
 *  - <CountUp>     un chiffre qui compte jusqu'à sa valeur en entrant à l'écran.
 *  - <VisionLines> le manifeste s'allume ligne à ligne au défilement.
 *  - <FloatingPhone> le téléphone arrive, flotte et s'incline vers la souris.
 * « Réduire les animations » : tout est rendu à l'état final, sans mouvement.
 */

/* ------------------------------------------------------------------ */
/* Rideau d'ouverture                                                  */
/* ------------------------------------------------------------------ */

const LETTERS = ['K', 'A', 'L', 'Y', 'X'];

export function Intro() {
  return (
    <div
      aria-hidden
      className="intro pointer-events-none fixed inset-0 z-[100] flex flex-col items-center justify-center"
      style={{ background: 'linear-gradient(180deg, #121532 0%, #38305F 55%, #E8896B 100%)' }}
    >
      <div className="intro-mark text-[#F1CF8A]">
        <Mark size={64} />
      </div>
      <p className="mt-6 flex overflow-hidden font-display text-2xl tracking-[0.5em] text-white">
        {LETTERS.map((l, i) => (
          <span key={l} className="intro-letter inline-block" style={{ animationDelay: `${0.25 + i * 0.06}s` }}>
            {l}
          </span>
        ))}
      </p>
      <span className="mt-8 h-0.5 w-40 overflow-hidden rounded-full bg-white/15">
        <span className="intro-bar block h-full w-full origin-left rounded-full bg-[#F1CF8A]" />
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Progression et rail des sections                                    */
/* ------------------------------------------------------------------ */

export function Progress({ sections }: { sections: { id: string; label: string }[] }) {
  const reduce = useReducedMotionSafe();
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 26 });
  const [active, setActive] = useState(sections[0]?.id);

  useEffect(() => {
    const els = sections.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: '-45% 0px -45% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [sections]);

  return (
    <>
      <motion.div aria-hidden className="fixed inset-x-0 top-0 z-[60] h-[3px] origin-left bg-gradient-to-r from-gold-light to-gold" style={{ scaleX: reduce ? 0 : progress }} />
      <nav aria-hidden className="fixed right-5 top-1/2 z-40 hidden -translate-y-1/2 flex-col items-end gap-3 2xl:flex rtl:left-5 rtl:right-auto">
        {sections.map((s) => {
          const on = s.id === active;
          return (
            <a key={s.id} href={`#${s.id}`} tabIndex={-1} className="group flex items-center gap-3">
              <span className={`rounded-full bg-ink-2/90 px-2.5 py-1 text-xs font-medium text-paper shadow-card ring-1 ring-cream-line transition-all duration-300 ${on ? 'opacity-100' : 'pointer-events-none translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100'}`}>
                {s.label}
              </span>
              <span className={`block rounded-full transition-all duration-500 ease-editorial ${on ? 'h-6 w-1.5 bg-sage' : 'h-1.5 w-1.5 bg-mist/40 group-hover:bg-mist'}`} />
            </a>
          );
        })}
      </nav>
    </>
  );
}

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

/* ------------------------------------------------------------------ */
/* Le manifeste qui s'allume                                           */
/* ------------------------------------------------------------------ */

function Line({ index, n, progress, children }: { index: number; n: number; progress: MotionValue<number>; children: React.ReactNode }) {
  const start = index / n;
  const end = (index + 0.8) / n;
  const opacity = useTransform(progress, [start, end], [0.18, 1]);
  return (
    <motion.li style={{ opacity }} className="border-t border-paper/10 py-5 font-display text-[1.6rem] leading-[1.22] [text-wrap:balance] text-paper first:border-t-0 sm:text-4xl lg:py-6 lg:text-[3.1rem]">
      {children}
    </motion.li>
  );
}

/** Le manifeste : chaque ligne s'allume quand elle passe au centre de l'écran. */
export function VisionLines({ lines }: { lines: readonly string[] }) {
  const reduce = useReducedMotionSafe();
  const ref = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.75', 'end 0.45'] });
  if (reduce) {
    return (
      <ol className="mt-14 lg:mt-20">
        {lines.map((l) => (
          <li key={l} className="border-t border-paper/10 py-5 font-display text-[1.6rem] leading-[1.22] [text-wrap:balance] text-paper first:border-t-0 sm:text-4xl lg:text-[3.1rem]">
            {l}
          </li>
        ))}
      </ol>
    );
  }
  return (
    <ol ref={ref} className="mt-14 lg:mt-20">
      {lines.map((l, i) => (
        <Line key={l} index={i} n={lines.length} progress={scrollYProgress}>
          {l}
        </Line>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------------ */
/* Le téléphone qui flotte                                             */
/* ------------------------------------------------------------------ */

/** Le téléphone arrive d'en bas, flotte doucement, s'incline vers la souris et remonte au défilement. */
export function FloatingPhone({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const reduce = useReducedMotionSafe();
  const { scrollY } = useScroll();
  const lift = useTransform(scrollY, [0, 800], [0, -120]);
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const srx = useSpring(rx, TILT_SPRING);
  const sry = useSpring(ry, TILT_SPRING);
  useEffect(() => {
    if (reduce || !window.matchMedia('(pointer: fine)').matches) return;
    const move = (e: PointerEvent) => {
      ry.set((e.clientX / window.innerWidth - 0.5) * 14);
      rx.set(-(e.clientY / window.innerHeight - 0.5) * 10);
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => window.removeEventListener('pointermove', move);
  }, [reduce, rx, ry]);
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} style={{ y: lift }}>
      <motion.div
        initial={{ y: 140, opacity: 0, rotateX: 18 }}
        animate={{ y: 0, opacity: 1, rotateX: 0 }}
        transition={{ duration: 1.3, ease: EASE, delay: 1.5 }}
        style={{ transformPerspective: 1200 }}
      >
        <motion.div style={{ rotateX: srx, rotateY: sry, transformPerspective: 1200 }}>
          <div className="phone-float">{children}</div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
