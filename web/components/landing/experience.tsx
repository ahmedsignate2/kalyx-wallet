'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  motion,
  useAnimationFrame,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
} from 'framer-motion';
import { Mark } from './mark';
import { TILT_SPRING } from './motion';

/*
 * La « finition » du film : ce qui sépare une page soignée d'une expérience.
 *  - <Intro>     : rideau d'ouverture (marque, lettres, jauge) — 100 % CSS, donc il se
 *                  lève même si le JavaScript ne charge pas ; animations réduites → absent.
 *  - <Grain>     : grain de pellicule sur tout l'écran (texture argentique).
 *  - <Cursor>    : anneau qui suit la souris et s'ouvre sur ce qui se clique.
 *  - <Magnetic>  : un bouton attiré par le pointeur quand il s'en approche.
 *  - <Marquee>   : grand bandeau serif qui défile et accélère avec le défilement.
 */

const LETTERS = ['K', 'A', 'L', 'Y', 'X'];

export function Intro() {
  return (
    <div aria-hidden className="intro pointer-events-none fixed inset-0 z-[100] flex flex-col items-center justify-center bg-ink">
      <div className="intro-mark text-paper">
        <Mark size={56} />
      </div>
      <p className="mt-6 flex overflow-hidden font-display text-2xl tracking-[0.5em] text-paper">
        {LETTERS.map((l, i) => (
          <span key={l} className="intro-letter inline-block" style={{ animationDelay: `${0.25 + i * 0.06}s` }}>
            {l}
          </span>
        ))}
      </p>
      <span className="mt-8 h-px w-40 overflow-hidden bg-bone/15">
        <span className="intro-bar block h-full w-full origin-left bg-sage" />
      </span>
    </div>
  );
}

export function Grain() {
  return <div aria-hidden className="grain pointer-events-none fixed -inset-[8%] z-[90] opacity-[0.07] mix-blend-overlay will-change-transform" />;
}

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
      // État React seulement s'il change : pas de re-rendu à chaque mouvement (120 Hz).
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
        className="pointer-events-none fixed left-0 top-0 z-[95] rounded-full border border-paper mix-blend-difference"
        style={{ x: ringX, y: ringY, translateX: '-50%', translateY: '-50%' }}
        animate={{ width: hover ? 56 : 32, height: hover ? 56 : 32, opacity: hover ? 1 : 0.6, scale: down ? 0.8 : 1 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-[95] h-1.5 w-1.5 rounded-full bg-paper mix-blend-difference"
        style={{ x, y, translateX: '-50%', translateY: '-50%' }}
        animate={{ scale: hover ? 0 : 1 }}
      />
    </>
  );
}

/** Le contenu est attiré par la souris (30 % de l'écart), puis revient en ressort. */
export function Magnetic({ children, strength = 0.3 }: { children: React.ReactNode; strength?: number }) {
  const reduce = useReducedMotion();
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

const wrap = (min: number, max: number, v: number) => {
  const r = max - min;
  return ((((v - min) % r) + r) % r) + min;
};

function MarqueeRow({ items, baseVelocity }: { items: readonly string[]; baseVelocity: number }) {
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
                <span className="px-6 font-display text-5xl font-light italic text-paper sm:px-10 sm:text-7xl lg:text-8xl">{it}</span>
                <Mark size={28} className="shrink-0 text-sage" />
              </span>
            ))}
          </span>
        ))}
      </motion.div>
    </div>
  );
}

export function Marquee({ items, label }: { items: readonly string[]; label: string }) {
  const reduce = useReducedMotion();
  if (reduce) {
    return (
      <section aria-label={label} className="px-5 py-16 text-center">
        <p className="font-display text-3xl italic text-paper">{items.join(' · ')}</p>
      </section>
    );
  }
  return (
    <section aria-label={label} className="relative overflow-hidden border-y border-bone/10 py-12 sm:py-16">
      <div className="space-y-4 sm:space-y-6">
        <MarqueeRow items={items} baseVelocity={-2.2} />
        <div className="opacity-40">
          <MarqueeRow items={[...items].reverse()} baseVelocity={1.6} />
        </div>
      </div>
      {/* Fondus sur les bords : le texte naît et disparaît dans l'encre. */}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-ink to-transparent sm:w-48" />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-ink to-transparent sm:w-48" />
    </section>
  );
}
