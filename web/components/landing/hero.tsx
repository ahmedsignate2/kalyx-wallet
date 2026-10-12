'use client';

import React, { useRef } from 'react';
import { motion, useMotionTemplate, useMotionValue, useScroll, useSpring, useTransform } from 'framer-motion';
import { ArrowDown, Download } from 'lucide-react';
import { PhoneMock } from './phone-mock';
import { EASE, TILT_SPRING } from './motion';
import { BitcoinIcon, SolanaIcon, TonIcon } from './networks';
import { Magnetic } from './experience';
import type { Dict } from '../../i18n';
import { APK_URL } from '../../lib/apk';
import { useReducedMotionSafe } from './reduced-motion';

/* Chaque chip (t.hero.chips) correspond à une fonctionnalité réellement implémentée (cf. never-stolen.tsx). */

const MAX_TILT = 14; // degrés, bascule au pointeur

/*
 * Jetons en orbite autour du téléphone, chacun à sa profondeur (z, en px) : plus ils
 * sont proches, plus ils glissent quand le téléphone bascule — c'est la parallaxe
 * qui donne le volume. Positions en % de la scène, durée de flottement propre à chacun.
 */
const COINS = [
  { icon: <BitcoinIcon size={22} />, x: '2%', y: '18%', z: 110, size: 'h-12 w-12', float: 5.2, delay: 0 },
  { icon: <SolanaIcon size={18} />, x: '84%', y: '30%', z: 70, size: 'h-10 w-10', float: 6.4, delay: 0.8 },
  { icon: <TonIcon size={20} />, x: '10%', y: '74%', z: 150, size: 'h-11 w-11', float: 5.8, delay: 1.6 },
] as const;

/** Entrée en scène : chaque bloc du texte arrive 120 ms après le précédent. */
const once = { once: true, margin: '0px 0px -10% 0px' } as const;
const enter = (i: number) => ({
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: once,
  transition: { duration: 1, ease: EASE, delay: 0.15 + i * 0.12 },
});

export function Hero({ t }: { t: Dict }) {
  const reduce = useReducedMotionSafe();
  const section = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  // Valeurs animées hors React : la bascule suit le pointeur à 60 i/s sans re-rendu.
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const tiltX = useSpring(rx, TILT_SPRING);
  const tiltY = useSpring(ry, TILT_SPRING);
  // Le reflet glisse à l'opposé de la bascule ; l'ombre au sol part de l'autre côté.
  const glareX = useTransform(tiltY, [-MAX_TILT, MAX_TILT], [85, 15]);
  const glareY = useTransform(tiltX, [-MAX_TILT, MAX_TILT], [10, 90]);
  const glare = useMotionTemplate`radial-gradient(120% 70% at ${glareX}% ${glareY}%, rgba(243, 239, 230, 0.16), transparent 55%)`;
  const shadowX = useTransform(tiltY, [-MAX_TILT, MAX_TILT], [28, -28]);

  // Au défilement, le téléphone se redresse et s'élève : l'action du visiteur le fait bouger.
  const { scrollYProgress } = useScroll({ target: section, offset: ['start start', 'end start'] });
  const scrollRotate = useSpring(useTransform(scrollYProgress, [0, 1], [-6, 4]), { stiffness: 120, damping: 26 });
  const scrollY = useSpring(useTransform(scrollYProgress, [0, 1], [0, -60]), { stiffness: 120, damping: 26 });

  // Souris, stylet ou doigt posé : le téléphone bascule vers le point visé.
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (reduce) return;
    const r = stage.current?.getBoundingClientRect();
    if (!r) return;
    const px = Math.max(-0.5, Math.min(0.5, (e.clientX - r.left) / r.width - 0.5));
    const py = Math.max(-0.5, Math.min(0.5, (e.clientY - r.top) / r.height - 0.5));
    rx.set(-py * 2 * MAX_TILT);
    ry.set(px * 2 * MAX_TILT);
  }
  function resetTilt() {
    rx.set(0);
    ry.set(0);
  }

  return (
    <section id="prologue" ref={section} className="relative scroll-mt-16 overflow-hidden px-5 pb-16 pt-20 sm:px-8 sm:pt-28 lg:pb-28 lg:pt-32">
      <div className="mx-auto grid max-w-page items-center gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10">
        <div className="md:text-center">
          <motion.p {...(reduce ? {} : enter(0))} className="mb-8 flex items-center gap-3 text-xs uppercase tracking-[0.22em] text-sage md:justify-center">
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

          <motion.p {...(reduce ? {} : enter(4))} className="mt-6 max-w-md text-base font-light leading-relaxed text-mist sm:text-lg md:mx-auto">
            {t.hero.sub}
          </motion.p>

          <motion.div {...(reduce ? {} : enter(5))} className="mt-9 flex flex-col gap-3 sm:flex-row md:justify-center">
            <Magnetic>
              <a
                href={APK_URL}
                download
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-paper px-6 text-sm font-medium text-ink transition-[background-color,transform] duration-200 ease-editorial hover:bg-bone active:scale-[0.97]"
              >
                <Download className="h-4 w-4" />
                {t.hero.cta}
              </a>
            </Magnetic>
            <Magnetic>
              <a
                href="#voler"
                className="group inline-flex h-12 items-center justify-center gap-2 rounded-full border border-bone/20 px-6 text-sm font-medium text-paper transition-colors duration-200 hover:border-bone/50"
              >
                {t.hero.ctaSecondary}
                <ArrowDown className="h-4 w-4 transition-transform duration-300 ease-editorial group-hover:translate-y-0.5" />
              </a>
            </Magnetic>
          </motion.div>

          <ul className="mt-9 flex flex-wrap gap-2 md:justify-center" aria-label={t.hero.keyPoints}>
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

        {/*
          Scène 3D : le téléphone arrive, flotte, bascule vers le pointeur et se redresse au défilement.
          Il a une épaisseur (tranches empilées en profondeur), un reflet qui glisse sur la vitre,
          une ombre au sol, et des jetons en orbite à différentes profondeurs.
        */}
        <motion.div
          ref={stage}
          onPointerMove={onPointerMove}
          onPointerLeave={resetTilt}
          onPointerCancel={resetTilt}
          onPointerUp={(e) => e.pointerType !== 'mouse' && resetTilt()}
          className="relative flex justify-center py-4 lg:justify-end lg:py-0"
          style={{ perspective: '1200px', y: reduce ? 0 : scrollY }}
          initial={reduce ? false : { opacity: 0, x: 40, rotateY: -18 }}
          whileInView={{ opacity: 1, x: 0, rotateY: 0 }}
          viewport={once}
          transition={{ duration: 1.4, ease: EASE, delay: 0.4 }}
        >
          {/* Ombre au sol : s'écarte à l'opposé de la bascule. */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute bottom-0 left-1/2 h-10 w-56 -translate-x-1/2 rounded-[50%] bg-black/60 blur-2xl lg:left-auto lg:right-8 lg:translate-x-0"
            style={{ x: reduce ? 0 : shadowX }}
          />
          <motion.div className="relative" style={{ rotateZ: reduce ? 0 : scrollRotate, transformStyle: 'preserve-3d' }}>
            <motion.div style={{ rotateX: reduce ? 0 : tiltX, rotateY: reduce ? 0 : tiltY, transformStyle: 'preserve-3d' }}>
              <motion.div
                style={{ transformStyle: 'preserve-3d' }}
                animate={reduce ? undefined : { y: [0, -10, 0] }}
                transition={{ duration: 6, ease: 'easeInOut', repeat: Infinity }}
              >
                <PhoneMock alt={t.hero.screenshotAlt} depth={!reduce} />
                {!reduce && (
                  <motion.div
                    aria-hidden
                    className="pointer-events-none absolute inset-[6px] rounded-[2.2rem] mix-blend-screen"
                    style={{ background: glare, transform: 'translateZ(1px)' }}
                  />
                )}
                {!reduce &&
                  COINS.map((c, i) => (
                    <div
                      key={i}
                      aria-hidden
                      className="pointer-events-none absolute"
                      style={{ left: c.x, top: c.y, transform: `translateZ(${c.z}px)`, transformStyle: 'preserve-3d' }}
                    >
                      <motion.div
                        className={`flex ${c.size} items-center justify-center rounded-full border border-bone/20 bg-paper/95 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.8)]`}
                        initial={{ opacity: 0, scale: 0.6 }}
                        animate={{ opacity: 1, scale: 1, y: [0, -12, 0], rotateY: [0, 18, 0] }}
                        transition={{
                          opacity: { duration: 0.8, delay: 1.2 + c.delay * 0.3 },
                          scale: { duration: 0.8, ease: EASE, delay: 1.2 + c.delay * 0.3 },
                          y: { duration: c.float, ease: 'easeInOut', repeat: Infinity, delay: c.delay },
                          rotateY: { duration: c.float * 1.3, ease: 'easeInOut', repeat: Infinity, delay: c.delay },
                        }}
                      >
                        {c.icon}
                      </motion.div>
                    </div>
                  ))}
              </motion.div>
            </motion.div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
