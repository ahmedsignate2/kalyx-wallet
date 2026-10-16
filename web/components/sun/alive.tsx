'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  animate,
  motion,
  useAnimationFrame,
  useInView,
  useMotionTemplate,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
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
 *  - <Cursor>      anneau doré qui suit la souris et s'ouvre sur ce qui se clique.
 *  - <Magnetic>    un bouton attiré par le pointeur.
 *  - <Words>       un titre qui se lève mot à mot.
 *  - <Marquee>     bandeau qui défile et accélère avec le défilement.
 *  - <Opening>     « Douze mots » : la phrase apparaît au défilement, puis se voile.
 *  - <Spotlight>   carte qui s'incline vers la souris, avec une lueur sous le pointeur.
 *  - <CountUp>     un chiffre qui compte jusqu'à sa valeur en entrant à l'écran.
 *  - <VisionLines> le manifeste s'allume ligne à ligne au défilement.
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
/* Curseur                                                             */
/* ------------------------------------------------------------------ */

const CLICKABLE = 'a, button, [role="button"], summary, label, input, select, textarea';

export function Cursor() {
  const [enabled, setEnabled] = useState(false);
  const [hover, setHover] = useState(false);
  const [down, setDown] = useState(false);
  const hovering = useRef(false);
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const ringX = useSpring(x, { stiffness: 420, damping: 34, mass: 0.5 });
  const ringY = useSpring(y, { stiffness: 420, damping: 34, mass: 0.5 });

  useEffect(() => {
    const fine = window.matchMedia('(pointer: fine)').matches;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!fine || reduce) return;
    setEnabled(true);
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      x.set(e.clientX);
      y.set(e.clientY);
      // État React seulement s'il change : pas de re-rendu à chaque mouvement.
      const over = !!(e.target as Element | null)?.closest?.(CLICKABLE);
      if (over !== hovering.current) {
        hovering.current = over;
        setHover(over);
      }
    };
    const press = () => setDown(true);
    const release = () => setDown(false);
    const leave = () => {
      x.set(-100);
      y.set(-100);
    };
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerdown', press);
    window.addEventListener('pointerup', release);
    document.documentElement.addEventListener('pointerleave', leave);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', press);
      window.removeEventListener('pointerup', release);
      document.documentElement.removeEventListener('pointerleave', leave);
    };
  }, [x, y]);

  if (!enabled) return null;
  return (
    <>
      <motion.div
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-[95] rounded-full border-[1.5px] border-gold"
        style={{ x: ringX, y: ringY, translateX: '-50%', translateY: '-50%' }}
        animate={{
          width: hover ? 54 : 30,
          height: hover ? 54 : 30,
          backgroundColor: hover ? 'rgba(221,181,101,0.16)' : 'rgba(221,181,101,0)',
          scale: down ? 0.8 : 1,
        }}
        transition={{ duration: 0.25, ease: EASE }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-[95] h-1.5 w-1.5 rounded-full bg-gold"
        style={{ x, y, translateX: '-50%', translateY: '-50%' }}
        animate={{ scale: hover ? 0 : 1 }}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Bouton aimanté                                                      */
/* ------------------------------------------------------------------ */

export function Magnetic({ children, strength = 0.3 }: { children: React.ReactNode; strength?: number }) {
  const reduce = useReducedMotionSafe();
  const ref = useRef<HTMLSpanElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const x = useSpring(mx, TILT_SPRING);
  const y = useSpring(my, TILT_SPRING);
  if (reduce) return <>{children}</>;
  return (
    <motion.span
      ref={ref}
      className="inline-flex [&>*]:w-full"
      style={{ x, y }}
      onPointerMove={(e) => {
        if (e.pointerType !== 'mouse' || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        mx.set((e.clientX - (r.left + r.width / 2)) * strength);
        my.set((e.clientY - (r.top + r.height / 2)) * strength);
      }}
      onPointerLeave={() => {
        mx.set(0);
        my.set(0);
      }}
    >
      {children}
    </motion.span>
  );
}

/* ------------------------------------------------------------------ */
/* Titre mot à mot                                                     */
/* ------------------------------------------------------------------ */

/** Chaque mot se lève de sous sa ligne. `parts` : [texte, classe] — pour colorer la fin. */
export function Words({ parts, className = '', as = 'h2', delay = 0 }: { parts: [string, string?][]; className?: string; as?: 'h1' | 'h2'; delay?: number }) {
  const reduce = useReducedMotionSafe();
  const Tag = as;
  const words = parts.flatMap(([text, cls]) => text.split(/\s+/).filter(Boolean).map((w) => ({ w, cls })));
  if (reduce) {
    return (
      <Tag className={className}>
        {parts.map(([text, cls], i) => (
          <span key={i} className={cls}>
            {text}{' '}
          </span>
        ))}
      </Tag>
    );
  }
  return (
    <Tag className={className}>
      <span className="sr-only">{parts.map(([t]) => t).join(' ')}</span>
      <motion.span aria-hidden initial="hidden" whileInView="show" viewport={{ once: true, margin: '0px 0px -8% 0px' }} transition={{ staggerChildren: 0.05, delayChildren: delay }}>
        {words.map(({ w, cls }, i) => (
          <span key={i} className="inline-block overflow-hidden pb-[0.12em] align-bottom">
            <motion.span
              className={`inline-block ${cls ?? ''}`}
              variants={{ hidden: { y: '105%', rotate: 4 }, show: { y: '0%', rotate: 0, transition: { duration: 0.85, ease: EASE } } }}
            >
              {w}
            </motion.span>
            {' '}
          </span>
        ))}
      </motion.span>
    </Tag>
  );
}

/* ------------------------------------------------------------------ */
/* Bandeau qui défile                                                  */
/* ------------------------------------------------------------------ */

const wrap = (min: number, max: number, v: number) => {
  const r = max - min;
  return ((((v - min) % r) + r) % r) + min;
};

function MarqueeRow({ items, baseVelocity, faded = false }: { items: readonly string[]; baseVelocity: number; faded?: boolean }) {
  const base = useMotionValue(0);
  const { scrollY } = useScroll();
  const velocity = useVelocity(scrollY);
  const smooth = useSpring(velocity, { damping: 50, stiffness: 400 });
  const factor = useTransform(smooth, [0, 1000], [0, 4], { clamp: false });
  const x = useTransform(base, (v) => `${wrap(-25, 0, v)}%`);
  const direction = useRef(1);

  useAnimationFrame((_, delta) => {
    let move = direction.current * baseVelocity * (delta / 1000);
    const f = factor.get();
    if (f < 0) direction.current = -1;
    else if (f > 0) direction.current = 1;
    move += direction.current * move * Math.abs(f);
    base.set(base.get() + move);
  });

  // Quatre copies : la boucle à -25 % retombe exactement sur la copie suivante.
  return (
    <div className="flex overflow-hidden whitespace-nowrap" dir="ltr">
      <motion.div className="flex shrink-0 flex-nowrap" style={{ x }}>
        {[0, 1, 2, 3].map((copy) => (
          <span key={copy} className="flex shrink-0 items-center" aria-hidden={copy > 0}>
            {items.map((it) => (
              <span key={it} className="flex items-center">
                <span className={`px-6 font-display text-5xl sm:px-10 sm:text-7xl lg:text-8xl ${faded ? 'text-transparent [-webkit-text-stroke:1.5px_rgba(184,134,58,0.55)]' : 'text-paper'}`}>{it}</span>
                <Mark size={30} className="shrink-0 text-sage" />
              </span>
            ))}
          </span>
        ))}
      </motion.div>
    </div>
  );
}

export function Marquee({ items, label }: { items: readonly string[]; label: string }) {
  const reduce = useReducedMotionSafe();
  if (reduce) {
    return (
      <section aria-label={label} className="px-5 py-14 text-center">
        <p className="font-display text-3xl text-paper">{items.join(' · ')}</p>
      </section>
    );
  }
  return (
    <section aria-label={label} className="relative overflow-hidden py-12 sm:py-16">
      <div className="space-y-3 sm:space-y-5">
        <MarqueeRow items={items} baseVelocity={-2.2} />
        <MarqueeRow items={[...items].reverse()} baseVelocity={1.6} faded />
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-ink to-transparent sm:w-48" />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-ink to-transparent sm:w-48" />
    </section>
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
/* Carte inclinable avec lueur                                         */
/* ------------------------------------------------------------------ */

export function Spotlight({ children, className = '', max = 6, glow = 'rgba(221,181,101,0.22)' }: { children: React.ReactNode; className?: string; max?: number; glow?: string }) {
  const reduce = useReducedMotionSafe();
  const ref = useRef<HTMLDivElement>(null);
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const gx = useMotionValue(50);
  const gy = useMotionValue(50);
  const go = useMotionValue(0);
  const srx = useSpring(rx, TILT_SPRING);
  const sry = useSpring(ry, TILT_SPRING);
  const sgo = useSpring(go, { stiffness: 200, damping: 30 });
  const bg = useMotionTemplate`radial-gradient(420px circle at ${gx}% ${gy}%, ${glow}, transparent 65%)`;
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      ref={ref}
      className={`relative ${className}`}
      style={{ rotateX: srx, rotateY: sry, transformPerspective: 900 }}
      onPointerMove={(e) => {
        if (e.pointerType !== 'mouse' || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        const u = (e.clientX - r.left) / r.width;
        const v = (e.clientY - r.top) / r.height;
        ry.set((u - 0.5) * max * 2);
        rx.set(-(v - 0.5) * max * 2);
        gx.set(u * 100);
        gy.set(v * 100);
        go.set(1);
      }}
      onPointerLeave={() => {
        rx.set(0);
        ry.set(0);
        go.set(0);
      }}
    >
      <motion.span aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit]" style={{ background: bg, opacity: sgo }} />
      {children}
    </motion.div>
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
  const opacity = useTransform(progress, [start, end], [0.28, 1]);
  const x = useTransform(progress, [start, end], [8, 0]);
  const scale = useTransform(progress, [start, end], [0.98, 1]);
  return (
    <motion.li style={{ opacity, x, scale }} className="flex items-center gap-4 rounded-2xl bg-ink-2 px-5 py-4 shadow-card ring-1 ring-cream-line">
      {children}
    </motion.li>
  );
}

export function VisionLines({ items }: { items: { text: string; icon: React.ReactNode }[] }) {
  const reduce = useReducedMotionSafe();
  const ref = useRef<HTMLUListElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.8', 'end 0.5'] });
  if (reduce) {
    return (
      <ul className="mx-auto mt-12 grid max-w-4xl gap-3">
        {items.map((it) => (
          <li key={it.text} className="flex items-center gap-4 rounded-2xl bg-ink-2 px-5 py-4 shadow-card ring-1 ring-cream-line">
            {it.icon}
            <span className="text-base font-medium leading-snug text-paper sm:text-lg">{it.text}</span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul ref={ref} className="mx-auto mt-12 grid max-w-4xl gap-3">
      {items.map((it, i) => (
        <Line key={it.text} index={i} n={items.length} progress={scrollYProgress}>
          {it.icon}
          <span className="text-base font-medium leading-snug text-paper sm:text-lg">{it.text}</span>
        </Line>
      ))}
    </ul>
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

/* ------------------------------------------------------------------ */
/* Animation CSS déclenchée à l'entrée dans l'écran                    */
/* ------------------------------------------------------------------ */

/** Pose la classe `play` quand le bloc entre à l'écran : les animations CSS internes démarrent alors. */
export function PlayOnView({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -15% 0px' });
  return (
    <div ref={ref} className={`play-on-view ${inView ? 'play' : ''} ${className}`}>
      {children}
    </div>
  );
}
