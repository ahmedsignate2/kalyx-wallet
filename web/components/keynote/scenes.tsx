'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useScroll, useTransform, type MotionValue } from 'framer-motion';
import { ArrowDown, ArrowUpRight, ChevronLeft, ChevronRight, Download as DownloadIcon } from 'lucide-react';
import { Landscape } from '../sun/landscape';
import { Phone, PhoneFrame } from '../sun/phone';
import { Decode, Duress, HoldToSend, Lookalike, PinLock, Whitelist } from '../sun/demos';
import { useReducedMotionSafe } from '../landing/reduced-motion';
import { EASE } from '../landing/motion';
import type { Dict } from '../../i18n';
import { APK_URL } from '../../lib/apk';
import { WEB_APP_URL } from '../../lib/links';

/*
 * La mise en scène d'une keynote : l'écran s'épingle et le produit se dévoile
 * au fil du défilement. Chaque scène lit sa progression (0 → 1) et en tire
 * opacité, position, échelle — rien ne bouge tout seul, tout suit le doigt.
 * « Réduire les animations » : chaque scène est rendue à son état final.
 */

const useProgress = (ref: React.RefObject<HTMLElement | null>, offset: ['start start', 'end end'] | ['start end', 'end start'] | ['start 0.85', 'end 0.35'] = ['start start', 'end end']) =>
  useScroll({ target: ref, offset }).scrollYProgress;

export function ApkPill({ label, size = 'md' }: { label: string; size?: 'sm' | 'md' }) {
  return (
    <a
      href={APK_URL}
      download
      className={`inline-flex items-center justify-center gap-2 rounded-full bg-[#F6EEE2] font-semibold text-[#0B0B10] transition-[transform,background-color] duration-200 hover:bg-white active:scale-[0.97] ${size === 'sm' ? 'h-9 px-4 text-sm' : 'h-12 px-7 text-[15px]'}`}
    >
      <DownloadIcon className="h-4 w-4" aria-hidden />
      {label}
    </a>
  );
}

function LinkArrow({ href, children, light = true }: { href: string; children: React.ReactNode; light?: boolean }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`group inline-flex items-center gap-1 text-[15px] font-medium ${light ? 'text-[#F2A274]' : 'text-[#C4552A]'}`}>
      <span className="group-hover:underline group-hover:underline-offset-4">{children}</span>
      <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
    </a>
  );
}

/* ------------------------------------------------------------------ */
/* 1. Le dévoilement                                                   */
/* ------------------------------------------------------------------ */

/**
 * Nuit noire, le nom géant apparaît ; on le traverse en zoomant ; le titre se
 * pose ; le téléphone monte de l'horizon pendant que l'aube se lève.
 */
export function Reveal({ t }: { t: Dict }) {
  const reduce = useReducedMotionSafe();
  const ref = useRef<HTMLElement>(null);
  const p = useProgress(ref);

  const nameOpacity = useTransform(p, [0, 0.1, 0.2], [1, 1, 0]);
  const nameScale = useTransform(p, [0, 0.2], [1, 2.6]);
  const nightOpacity = useTransform(p, [0, 0.12], [0.35, 1]);
  const dawnOpacity = useTransform(p, [0.35, 0.8], [0, 1]);
  const textOpacity = useTransform(p, [0.14, 0.26, 0.5, 0.6], [0, 1, 1, 0]);
  const textY = useTransform(p, [0.14, 0.26, 0.5, 0.66], [40, 0, 0, -160]);
  // Le téléphone s'arrête sous le bouton, puis monte quand le texte s'en va.
  const phoneY = useTransform(p, [0.2, 0.42, 0.5, 0.86], ['105vh', '64vh', '62vh', '9vh']);
  const phoneScale = useTransform(p, [0.2, 0.86], [0.84, 1.04]);
  const phoneRotate = useTransform(p, [0.2, 0.6], [28, 0]);
  const cue = useTransform(p, [0, 0.04], [1, 0]);

  if (reduce) {
    return (
      <section id="prologue" className="relative overflow-hidden bg-black px-5 pb-20 pt-32 text-center">
        <Landscape id="reveal-dawn" phase="dawn" sunAt={0.3} veil />
        <div className="relative">
          <HeroText t={t} />
          <div className="mt-12 flex justify-center">
            <Phone />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="prologue" ref={ref} className="relative h-[460vh] bg-black">
      <div className="sticky top-0 h-svh overflow-hidden">
        <motion.div className="absolute inset-0" style={{ opacity: nightOpacity }}>
          <Landscape id="reveal-night" phase="night" sunAt={0.2} sunX={0.88} sunAtMobile={0.62} sunXMobile={0.85} />
        </motion.div>
        <motion.div className="absolute inset-0" style={{ opacity: dawnOpacity }}>
          <Landscape id="reveal-dawn" phase="dawn" sunAt={0.2} sunX={0.88} sunAtMobile={0.62} sunXMobile={0.85} veil />
        </motion.div>

        {/* Le nom, qu'on traverse. */}
        <motion.div className="absolute inset-0 flex items-center justify-center" style={{ opacity: nameOpacity, scale: nameScale }}>
          <motion.h1
            initial={{ opacity: 0, y: 24, filter: 'blur(12px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 1.4, ease: EASE, delay: 0.2 }}
            className="select-none font-display text-[26vw] font-semibold leading-none tracking-[-0.06em] text-white sm:text-[20vw]"
          >
            Kalyx<span className="text-[#E6C682]">.</span>
          </motion.h1>
        </motion.div>

        <motion.div className="absolute inset-x-0 top-[13vh] px-5 text-center" style={{ opacity: textOpacity, y: textY }}>
          <HeroText t={t} />
        </motion.div>

        <motion.div className="absolute inset-x-0 top-0 flex justify-center" style={{ y: phoneY, scale: phoneScale, rotateX: phoneRotate, transformPerspective: 1400 }}>
          <Phone />
        </motion.div>

        <motion.p style={{ opacity: cue }} className="absolute inset-x-0 bottom-8 flex items-center justify-center gap-2 text-xs font-medium text-white/60">
          {t.opening.cue} <ArrowDown className="h-3.5 w-3.5 animate-bounce" aria-hidden />
        </motion.p>
      </div>
    </section>
  );
}

function HeroText({ t }: { t: Dict }) {
  return (
    <>
      <p className="text-sm font-semibold text-[#E6C682]">Kalyx Wallet</p>
      <h2 className="mx-auto mt-3 max-w-4xl font-display text-[2.6rem] font-semibold leading-[1.04] tracking-[-0.035em] text-white sm:text-6xl lg:text-7xl">
        {t.hero.line1} {t.hero.line2} <span className="grad-warm">{t.hero.line3}</span>
      </h2>
      <p className="mx-auto mt-5 max-w-xl text-[17px] leading-relaxed text-white/75 sm:text-xl">{t.hero.sub}</p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
        <ApkPill label={t.hero.cta} />
        <LinkArrow href={WEB_APP_URL}>{t.nav.webApp}</LinkArrow>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Les points forts : une galerie qu'on fait glisser                 */
/* ------------------------------------------------------------------ */

const GLOW = ['#9DBEF5', '#F6A982', '#B9ABFF', '#E6C682', '#72D9AC', '#9DBEF5'];

export function Highlights({ t }: { t: Dict }) {
  const rail = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const n = t.how.steps.length;
  const go = (d: number) => {
    const el = rail.current;
    if (!el) return;
    const tile = el.querySelector('li');
    el.scrollBy({ left: d * ((tile?.clientWidth ?? 400) + 20), behavior: 'smooth' });
  };
  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    const on = () => {
      const tile = el.querySelector('li');
      setAt(Math.round(el.scrollLeft / ((tile?.clientWidth ?? 400) + 20)));
    };
    el.addEventListener('scroll', on, { passive: true });
    return () => el.removeEventListener('scroll', on);
  }, []);

  return (
    <section id="fonctionnement" className="scroll-mt-12 bg-black py-24 sm:py-32">
      <div className="mx-auto max-w-page px-5 sm:px-8">
        <h2 className="font-display text-[2.6rem] font-semibold leading-[1.05] tracking-[-0.035em] text-white sm:text-6xl">
          {t.how.title} <span className="text-white/45">{t.how.titleEm}</span>
        </h2>
      </div>
      <div
        ref={rail}
        className="no-scrollbar mt-12 flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth pb-4"
        style={{ paddingInline: 'max(1.25rem, calc((100vw - 76rem) / 2 + 2rem))', scrollPaddingInline: 'max(1.25rem, calc((100vw - 76rem) / 2 + 2rem))' }}
      >
        <ul className="flex gap-5">
          {t.how.steps.map((s, i) => (
            <li
              key={s.title}
              className="relative flex h-[560px] w-[82vw] max-w-[420px] shrink-0 snap-start flex-col overflow-hidden rounded-[28px] bg-[#161617] p-8 sm:w-[420px]"
            >
              <div aria-hidden className="pointer-events-none absolute -bottom-40 left-1/2 h-80 w-[140%] -translate-x-1/2 rounded-full opacity-40 blur-3xl" style={{ background: GLOW[i] }} />
              <p className="relative text-sm font-semibold" style={{ color: GLOW[i] }}>{s.label}</p>
              <h3 className="relative mt-3 font-display text-[1.9rem] font-semibold leading-[1.1] tracking-[-0.03em] text-white">{s.title}</h3>
              <p className="relative mt-4 text-[15px] leading-relaxed text-white/60">{s.text}</p>
              <div className="relative mt-auto">
                {i === 1 ? (
                  <HoldToSend value={s.value} label={s.label} />
                ) : (
                  <p className="font-display text-[5.5rem] font-semibold leading-none tracking-[-0.05em]" style={{ color: GLOW[i] }}>
                    {s.value}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="mx-auto mt-6 flex max-w-page items-center justify-between px-5 sm:px-8">
        <div className="flex gap-2" aria-hidden>
          {Array.from({ length: n }, (_, i) => (
            <span key={i} className={`h-2 rounded-full transition-all duration-300 ${i === at ? 'w-6 bg-white/80' : 'w-2 bg-white/25'}`} />
          ))}
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={() => go(-1)} aria-label="←" className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 disabled:opacity-30" disabled={at === 0}>
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button type="button" onClick={() => go(1)} aria-label="→" className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 disabled:opacity-30" disabled={at >= n - 1}>
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Le chiffre géant                                                 */
/* ------------------------------------------------------------------ */

/** Un chiffre qui grandit jusqu'à remplir l'écran, épinglé le temps de le lire. */
export function Giant({ value, label, text }: { value: string; label: string; text: string }) {
  const reduce = useReducedMotionSafe();
  const ref = useRef<HTMLElement>(null);
  const p = useProgress(ref);
  const scale = useTransform(p, [0, 0.55], [0.45, 1]);
  const opacity = useTransform(p, [0, 0.25, 0.85, 1], [0, 1, 1, 0.4]);
  const capOpacity = useTransform(p, [0.45, 0.6], [0, 1]);
  const capY = useTransform(p, [0.45, 0.6], [24, 0]);
  if (reduce) {
    return (
      <section className="bg-black px-5 py-28 text-center">
        <p className="grad-warm font-display text-[38vw] font-semibold leading-none tracking-[-0.06em] sm:text-[26vw]">{value}</p>
        <p className="mt-4 text-2xl font-semibold text-white">{label}</p>
        <p className="mx-auto mt-3 max-w-xl text-white/60">{text}</p>
      </section>
    );
  }
  return (
    <section ref={ref} className="relative h-[220vh] bg-black">
      <div className="sticky top-0 flex h-svh flex-col items-center justify-center overflow-hidden px-5 text-center">
        <motion.p style={{ scale, opacity }} className="grad-warm font-display text-[42vw] font-semibold leading-[0.85] tracking-[-0.06em] sm:text-[30vw]">
          {value}
        </motion.p>
        <motion.div style={{ opacity: capOpacity, y: capY }}>
          <p className="mt-4 font-display text-3xl font-semibold tracking-[-0.03em] text-white sm:text-5xl">{label}</p>
          <p className="mx-auto mt-4 max-w-xl text-[17px] leading-relaxed text-white/60">{text}</p>
        </motion.div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 4. Le texte qui s'allume mot à mot                                  */
/* ------------------------------------------------------------------ */

function LitWord({ word, i, n, p, accent }: { word: string; i: number; n: number; p: MotionValue<number>; accent?: boolean }) {
  const start = i / n;
  const opacity = useTransform(p, [start, start + 1.5 / n], [0.16, 1]);
  return (
    <motion.span style={{ opacity }} className={accent ? 'text-[#E6C682]' : undefined}>
      {word}{' '}
    </motion.span>
  );
}

/** Un paragraphe qui s'allume mot après mot pendant qu'on le lit. `accent` : les mots à dorer. */
export function LitText({ parts, className = '', dark = true }: { parts: [string, boolean?][]; className?: string; dark?: boolean }) {
  const reduce = useReducedMotionSafe();
  const ref = useRef<HTMLParagraphElement>(null);
  const p = useProgress(ref, ['start 0.85', 'end 0.35']);
  const words = parts.flatMap(([text, accent]) => text.split(/\s+/).filter(Boolean).map((w) => ({ w, accent: !!accent })));
  const cls = `font-display text-[1.9rem] font-semibold leading-[1.18] tracking-[-0.03em] sm:text-5xl lg:text-[3.6rem] ${dark ? 'text-white' : 'text-paper'} ${className}`;
  if (reduce) {
    return (
      <p className={cls}>
        {parts.map(([text, accent], i) => (
          <span key={i} className={accent ? 'text-[#E6C682]' : undefined}>
            {text}{' '}
          </span>
        ))}
      </p>
    );
  }
  return (
    <p ref={ref} className={cls}>
      {words.map(({ w, accent }, i) => (
        <LitWord key={i} word={w} i={i} n={words.length} p={p} accent={accent} />
      ))}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* 5. La sécurité : le téléphone reste, l'écran change                 */
/* ------------------------------------------------------------------ */

export function SecurityScroll({ t }: { t: Dict }) {
  const s = t.stolen;
  const scenes = [
    { k: s.s1.kicker, title: s.s1.title, text: s.s1.text, demo: <Lookalike s={s.s1} /> },
    { k: s.s2.kicker, title: s.s2.title, text: s.s2.text, demo: <Decode s={s.s2} /> },
    { k: s.s3.kicker, title: s.s3.title, text: s.s3.text, foot: s.s3.closing, demo: <PinLock s={s.s3} /> },
    { k: s.s4.kicker, title: s.s4.title, text: s.s4.text, foot: s.s4.closing, demo: <Whitelist s={s.s4} /> },
    { k: s.s5.kicker, title: s.s5.title, text: s.s5.text, foot: s.s5.closing, demo: <Duress s={s.s5} /> },
  ];
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.i));
      },
      { rootMargin: '-45% 0px -45% 0px' },
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <section id="voler" className="relative scroll-mt-12 bg-black px-5 pt-24 sm:px-8 sm:pt-32">
      <div className="mx-auto max-w-page">
        <p className="text-sm font-semibold text-[#E6C682]">{s.kicker}</p>
        <h2 className="mt-3 max-w-4xl font-display text-[2.6rem] font-semibold leading-[1.05] tracking-[-0.035em] text-white sm:text-6xl lg:text-7xl">
          {s.title} <span className="text-white/45">{s.titleEm}</span>
        </h2>
        <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-white/60 sm:text-xl">{s.lead}</p>

        <div className="mt-10 grid lg:grid-cols-2 lg:gap-16">
          <div>
            {scenes.map((sc, i) => (
              <div
                key={sc.k}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                data-i={i}
                className="flex flex-col justify-center py-14 lg:min-h-[100svh] lg:py-0"
              >
                <p className={`text-sm font-semibold transition-colors duration-500 ${active === i ? 'text-[#E6C682]' : 'text-white/40'}`}>
                  {s.scene} {i + 1} · {sc.k}
                </p>
                <h3 className={`mt-3 font-display text-3xl font-semibold leading-[1.1] tracking-[-0.03em] transition-colors duration-500 sm:text-[2.6rem] ${active === i ? 'text-white' : 'text-white/35'}`}>
                  {sc.title}
                </h3>
                <p className="mt-4 max-w-md text-[17px] leading-relaxed text-white/60">{sc.text}</p>
                {sc.foot ? <p className="mt-3 max-w-md text-sm leading-relaxed text-white/40">{sc.foot}</p> : null}
                {/* Sur téléphone, la démo suit directement le texte. */}
                <div className="mt-8 rounded-[24px] bg-[#161617] p-6 lg:hidden">{sc.demo}</div>
              </div>
            ))}
          </div>
          <div className="hidden lg:block">
            <div className="sticky top-0 flex h-svh items-center justify-center">
              <PhoneFrame screen="bg-[#0B0B10]" className="text-white">
                <div className="h-[620px] px-5 pt-16">
                  <div className="mb-6 flex items-center justify-between text-xs text-white/50">
                    <span className="font-semibold text-white">Kalyx</span>
                    <span>
                      {active + 1} / {scenes.length}
                    </span>
                  </div>
                  <AnimatePresence mode="wait">
                    <motion.div key={active} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.4, ease: EASE }}>
                      {scenes[active].demo}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </PhoneFrame>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 6. La finale : l'aube                                               */
/* ------------------------------------------------------------------ */

export function Finale({ t, children }: { t: Dict; children?: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotionSafe();
  const p = useScroll({ target: ref, offset: ['start end', 'end end'] }).scrollYProgress;
  const y = useTransform(p, [0, 1], [80, 0]);
  const opacity = useTransform(p, [0.3, 0.8], [0, 1]);
  return (
    <section id="telecharger" ref={ref} className="relative flex min-h-[110svh] scroll-mt-12 items-center overflow-hidden px-5 py-28 sm:px-8">
      <Landscape id="finale" phase="dawn" sunAt={0.2} sunX={0.86} sunAtMobile={0.12} veil parallax="through" rise />
      <motion.div style={reduce ? undefined : { y, opacity }} className="relative mx-auto max-w-3xl text-center text-white">
        <p className="text-sm font-semibold text-[#FFE1B8]">{t.download.kicker}</p>
        <h2 className="mt-3 font-display text-[2.8rem] font-semibold leading-[1.02] tracking-[-0.04em] sm:text-7xl lg:text-8xl">
          {t.download.title} <span className="text-white/60">{t.download.titleEm}</span>
        </h2>
        <p className="mx-auto mt-6 max-w-lg text-[17px] leading-relaxed text-white/80 sm:text-xl">{t.download.sub}</p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          <ApkPill label={t.download.cta} />
          <LinkArrow href="https://t.me/kalyxntw">{t.download.telegram}</LinkArrow>
        </div>
        {children}
      </motion.div>
    </section>
  );
}
