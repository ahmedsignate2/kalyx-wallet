'use client';

import React, { useRef, useState } from 'react';
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from 'framer-motion';
import { ArrowDown, Download } from 'lucide-react';
import { PhoneMock } from './phone-mock';
import { EASE } from './motion';
import type { Dict } from '../../i18n';

/* Chaque chip (t.hero.chips) correspond à une fonctionnalité réellement implémentée (cf. never-stolen.tsx). */

const MAX_TILT = 14; // degrés, bascule au pointeur

/** Entrée en scène : chaque bloc du texte arrive 120 ms après le précédent. */
const once = { once: true, margin: '0px 0px -10% 0px' } as const;
const enter = (i: number) => ({
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: once,
  transition: { duration: 1, ease: EASE, delay: 0.15 + i * 0.12 },
});

export function Hero({ t }: { t: Dict }) {
  const reduce = useReducedMotion();
  const section = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  // Au défilement, le téléphone se redresse et s'élève : l'action du visiteur le fait bouger.
  const { scrollYProgress } = useScroll({ target: section, offset: ['start start', 'end start'] });
  const scrollRotate = useSpring(useTransform(scrollYProgress, [0, 1], [-6, 4]), { stiffness: 120, damping: 26 });
  const scrollY = useSpring(useTransform(scrollYProgress, [0, 1], [0, -60]), { stiffness: 120, damping: 26 });

  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (reduce) return;
    const r = stage.current?.getBoundingClientRect();
    if (!r) return;
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    setTilt({ x: -py * MAX_TILT, y: px * MAX_TILT });
  }

  return (
    <section id="prologue" ref={section} className="relative scroll-mt-16 overflow-hidden px-5 pb-16 pt-20 sm:px-8 sm:pt-28 lg:pb-28 lg:pt-32">
      <div className="mx-auto grid max-w-page items-center gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10">
        <div>
          <motion.p {...(reduce ? {} : enter(0))} className="mb-8 flex items-center gap-3 text-xs uppercase tracking-[0.22em] text-sage">
            <motion.span
              className="h-px w-8 origin-left bg-sage"
              initial={reduce ? false : { scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={once}
              transition={{ duration: 1, ease: EASE, delay: 0.3 }}
            />
            {t.hero.kicker}
          </motion.p>

          <h1 className="font-display text-[2.5rem] font-light leading-[1.04] tracking-[-0.02em] text-paper sm:text-6xl lg:text-7xl">
            {[t.hero.line1, t.hero.line2].map((line, i) => (
              <span key={line} className="block overflow-hidden">
                <motion.span
                  className="block"
                  initial={reduce ? false : { y: '110%' }}
                  whileInView={{ y: 0 }}
                  viewport={once}
                  transition={{ duration: 1.1, ease: EASE, delay: 0.25 + i * 0.12 }}
                >
                  {line}
                </motion.span>
              </span>
            ))}
            <span className="block overflow-hidden">
              <motion.em
                className="block font-normal italic text-sage"
                initial={reduce ? false : { y: '110%' }}
                whileInView={{ y: 0 }}
                viewport={once}
                transition={{ duration: 1.1, ease: EASE, delay: 0.49 }}
              >
                {t.hero.line3}
              </motion.em>
            </span>
          </h1>

          <motion.p {...(reduce ? {} : enter(4))} className="mt-6 max-w-md text-base font-light leading-relaxed text-mist sm:text-lg">
            {t.hero.sub}
          </motion.p>

          <motion.div {...(reduce ? {} : enter(5))} className="mt-9 flex flex-col gap-3 sm:flex-row">
            <a
              href="/kalyx-wallet.apk"
              download
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-paper px-6 text-sm font-medium text-ink transition-[background-color,transform] duration-200 ease-editorial hover:bg-bone active:scale-[0.97]"
            >
              <Download className="h-4 w-4" />
              {t.hero.cta}
            </a>
            <a
              href="#voler"
              className="group inline-flex h-12 items-center justify-center gap-2 rounded-full border border-bone/20 px-6 text-sm font-medium text-paper transition-colors duration-200 hover:border-bone/50"
            >
              {t.hero.ctaSecondary}
              <ArrowDown className="h-4 w-4 transition-transform duration-300 ease-editorial group-hover:translate-y-0.5" />
            </a>
          </motion.div>

          <ul className="mt-9 flex flex-wrap gap-2" aria-label={t.hero.keyPoints}>
            {t.hero.chips.map((c, i) => (
              <motion.li
                key={c}
                {...(reduce ? {} : enter(6 + i * 0.5))}
                className="rounded-full border border-bone/10 bg-ink-2 px-3 py-1.5 text-xs text-bone/80"
              >
                {c}
              </motion.li>
            ))}
          </ul>
        </div>

        {/* Scène 3D : le téléphone arrive, flotte, bascule vers le pointeur et se redresse au défilement. */}
        <motion.div
          ref={stage}
          onMouseMove={onMouseMove}
          onMouseLeave={() => setTilt({ x: 0, y: 0 })}
          className="relative flex justify-center py-4 lg:justify-end lg:py-0"
          style={{ perspective: '1200px', y: reduce ? 0 : scrollY }}
          initial={reduce ? false : { opacity: 0, x: 40, rotateY: -18 }}
          whileInView={{ opacity: 1, x: 0, rotateY: 0 }}
          viewport={once}
          transition={{ duration: 1.4, ease: EASE, delay: 0.4 }}
        >
          <motion.div style={{ rotateZ: reduce ? 0 : scrollRotate, transformStyle: 'preserve-3d' }}>
            <div
              className="transition-transform duration-200 ease-editorial motion-reduce:transition-none"
              style={{ transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`, transformStyle: 'preserve-3d' }}
            >
              <motion.div
                animate={reduce ? undefined : { y: [0, -10, 0] }}
                transition={{ duration: 6, ease: 'easeInOut', repeat: Infinity }}
              >
                <PhoneMock alt={t.hero.screenshotAlt} />
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
