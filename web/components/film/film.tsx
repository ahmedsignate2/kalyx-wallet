'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, useMotionTemplate, useMotionValueEvent, useScroll, useTransform, type MotionValue } from 'framer-motion';
import { ArrowDown } from 'lucide-react';
import { Mark } from '../landing/mark';
import { useReducedMotionSafe } from '../landing/reduced-motion';
import { ApkPill } from '../keynote/scenes';
import type { Dict } from '../../i18n';
import { RELEASES_URL, SOURCE_URL } from '../../lib/links';

/*
 * Le site comme un film : on entre dans la salle (bandes noires du
 * cinémascope, grain, vignettage), le générique d'ouverture pose le titre,
 * des cartons annoncent chaque chapitre, un timecode suit la projection, et
 * le générique de fin déroule — avec les vrais crédits : réseaux, routeurs,
 * protocoles, fournisseurs. Tout suit le défilement ; rien ne joue tout seul.
 */

const useIso = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/* ------------------------------------------------------------------ */
/* La salle : bandes, grain, vignettage, timecode                      */
/* ------------------------------------------------------------------ */

/** Durée de « projection » affichée par le timecode : la page entière = 12 minutes à 24 images/s. */
const RUNTIME_S = 12 * 60;

function timecode(p: number) {
  const total = Math.max(0, Math.min(1, p)) * RUNTIME_S;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const f = Math.floor((total * 24) % 24);
  return [h, m, s, f].map((n) => String(n).padStart(2, '0')).join(':');
}

export function Theater({ chapters }: { chapters: { id: string; label: string }[] }) {
  const reduce = useReducedMotionSafe();
  const { scrollY, scrollYProgress } = useScroll();
  // Repères mesurés : fin de l'ouverture, début du générique de fin.
  const marks = useRef({ openEnd: 0, creditsStart: Infinity, vh: 800 });
  useIso(() => {
    const measure = () => {
      const open = document.getElementById('ouverture');
      const credits = document.getElementById('generique');
      const vh = window.innerHeight;
      marks.current = {
        openEnd: open ? open.offsetTop + open.offsetHeight - vh : 0,
        creditsStart: credits ? credits.offsetTop - vh * 0.6 : Infinity,
        vh,
      };
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  // Bandes : pleines pendant l'ouverture, s'ouvrent sur un écran, reviennent pour le générique.
  const bar = useTransform(scrollY, (y) => {
    const { openEnd, creditsStart, vh } = marks.current;
    const open = y <= openEnd ? 1 : Math.max(0, 1 - (y - openEnd) / (vh * 0.9));
    const close = y >= creditsStart ? Math.min(1, (y - creditsStart) / (vh * 0.6)) : 0;
    return Math.max(open, close);
  });
  const barH = useMotionTemplate`calc(${bar} * var(--bar-h))`;

  const [tc, setTc] = useState('00:00:00:00');
  useMotionValueEvent(scrollYProgress, 'change', (v) => setTc(timecode(v)));

  const [chapter, setChapter] = useState('');
  useEffect(() => {
    const els = chapters.map((c) => document.getElementById(c.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setChapter(chapters.find((c) => c.id === e.target.id)?.label ?? '');
      },
      { rootMargin: '-50% 0px -50% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [chapters]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[70] [--bar-h:7vh] sm:[--bar-h:11vh]">
      {!reduce && (
        <>
          <motion.div className="absolute inset-x-0 top-0 bg-black" style={{ height: barH }} />
          <motion.div className="absolute inset-x-0 bottom-0 bg-black" style={{ height: barH }} />
        </>
      )}
      {/* Grain de pellicule, vignettage, papillotement. */}
      <div className="absolute inset-0 overflow-hidden opacity-[0.07] mix-blend-overlay">
        <div className="grain absolute -inset-[8%]" />
      </div>
      <div className="film-vignette absolute inset-0" />
      {!reduce && <div className="film-flicker absolute inset-0 bg-white" />}
      {/* Le timecode de projection, en bas à gauche. */}
      <div className="absolute bottom-3 left-4 flex items-center gap-3 font-mono text-[10px] tracking-[0.12em] text-white/55 mix-blend-difference sm:bottom-4 sm:left-6 sm:text-[11px]">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#FF6B5E]" />
        <span className="tabular-nums">{tc}</span>
        {chapter ? <span className="hidden uppercase sm:inline">· {chapter}</span> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Le générique d'ouverture                                            */
/* ------------------------------------------------------------------ */

const WORDS = ['ocean', 'planet', 'silent', 'orbit', 'north', 'garden', 'river', 'pulse', 'velvet', 'cradle', 'mirror', 'fossil'];

function OpeningWord({ w, i, p }: { w: string; i: number; p: MotionValue<number> }) {
  const at = 0.46 + i * 0.022;
  const opacity = useTransform(p, [at, at + 0.03, 0.78, 0.86], [0, 1, 1, 0.1]);
  const blur = useTransform(p, [at, at + 0.03, 0.78, 0.86], [10, 0, 0, 8]);
  const filter = useMotionTemplate`blur(${blur}px)`;
  return (
    <motion.li style={{ opacity, filter }} className="flex items-baseline gap-2 font-mono text-sm text-white/85 sm:text-base">
      <span className="text-white/35">{String(i + 1).padStart(2, '0')}</span>
      {w}
    </motion.li>
  );
}

/**
 * Noir. La marque s'allume comme un projecteur. Le titre du film arrive en
 * mise au point. Puis les douze mots, comme un générique, avant que le voile
 * de l'app les recouvre — et la légende, en sous-titre.
 */
export function FilmOpening({ t }: { t: Dict }) {
  const reduce = useReducedMotionSafe();
  const ref = useRef<HTMLElement>(null);
  const p = useScroll({ target: ref, offset: ['start start', 'end end'] }).scrollYProgress;

  const markOpacity = useTransform(p, [0, 0.14, 0.2], [1, 1, 0]);
  const markScale = useTransform(p, [0, 0.2], [1, 0.8]);
  const titleOpacity = useTransform(p, [0.16, 0.24, 0.38, 0.44], [0, 1, 1, 0]);
  const titleBlur = useTransform(p, [0.16, 0.26], [18, 0]);
  const titleFilter = useMotionTemplate`blur(${titleBlur}px)`;
  const titleScale = useTransform(p, [0.16, 0.44], [1.08, 1]);
  const subOpacity = useTransform(p, [0.26, 0.32, 0.38, 0.44], [0, 1, 1, 0]);
  const capOpacity = useTransform(p, [0.84, 0.9, 0.97, 1], [0, 1, 1, 0]);
  const cue = useTransform(p, [0, 0.04], [1, 0]);

  if (reduce) {
    return (
      <section id="ouverture" className="bg-black px-5 py-28 text-center text-white">
        <Mark size={56} className="mx-auto text-[#E6C682]" />
        <h1 className="mt-8 font-display text-6xl font-semibold tracking-[-0.04em]">{t.opening.title}</h1>
        <p className="mx-auto mt-4 max-w-md text-white/70">{t.opening.sub}</p>
        <p className="mx-auto mt-8 max-w-lg text-white/60">{t.opening.caption}</p>
      </section>
    );
  }

  return (
    <section id="ouverture" ref={ref} className="relative h-[520vh] bg-black">
      <div className="sticky top-0 flex h-svh items-center justify-center overflow-hidden px-6">
        {/* Le faisceau du projecteur. */}
        <div aria-hidden className="beam pointer-events-none absolute left-1/2 top-0 h-full w-[140vw] -translate-x-1/2" />

        <motion.div style={{ opacity: markOpacity, scale: markScale }} className="absolute flex flex-col items-center">
          <motion.div initial={{ opacity: 0, rotate: -90, scale: 0.6 }} animate={{ opacity: 1, rotate: 0, scale: 1 }} transition={{ duration: 2.2, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}>
            <Mark size={88} className="text-[#E6C682] drop-shadow-[0_0_40px_rgba(230,198,130,0.55)]" />
          </motion.div>
          <motion.p initial={{ opacity: 0, letterSpacing: '1.2em' }} animate={{ opacity: 1, letterSpacing: '0.6em' }} transition={{ duration: 2.4, delay: 1 }} className="mt-8 pl-[0.6em] font-display text-xl font-semibold text-white/90 sm:text-2xl">
            KALYX
          </motion.p>
        </motion.div>

        <motion.div style={{ opacity: titleOpacity, filter: titleFilter, scale: titleScale }} className="absolute px-6 text-center">
          <h1 className="font-display text-[17vw] font-semibold leading-none tracking-[-0.05em] text-white sm:text-[11vw]">{t.opening.title}</h1>
          <motion.p style={{ opacity: subOpacity }} className="mx-auto mt-6 max-w-xl text-base text-white/70 sm:text-xl">
            {t.opening.sub}
          </motion.p>
        </motion.div>

        <ol className="absolute grid grid-cols-2 gap-x-10 gap-y-3 sm:grid-cols-3 sm:gap-x-16" aria-hidden>
          {WORDS.map((w, i) => (
            <OpeningWord key={w} w={w} i={i} p={p} />
          ))}
        </ol>

        {/* La légende, en sous-titre de film. */}
        <motion.p style={{ opacity: capOpacity }} className="subtitle absolute inset-x-6 bottom-[16vh] mx-auto max-w-2xl text-center text-lg sm:text-2xl">
          {t.opening.caption}
        </motion.p>

        <motion.p style={{ opacity: cue }} className="absolute bottom-[14vh] flex items-center gap-2 text-xs font-medium text-white/50">
          {t.opening.cue} <ArrowDown className="h-3.5 w-3.5 animate-bounce" aria-hidden />
        </motion.p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Les cartons de chapitre                                             */
/* ------------------------------------------------------------------ */

/** Un intertitre plein écran : le numéro, le nom, en mise au point, puis fondu au noir. */
export function TitleCard({ numeral, word, name, id }: { numeral?: string; word: string; name: string; id?: string }) {
  const reduce = useReducedMotionSafe();
  const ref = useRef<HTMLElement>(null);
  const p = useScroll({ target: ref, offset: ['start start', 'end end'] }).scrollYProgress;
  const opacity = useTransform(p, [0, 0.25, 0.7, 1], [0, 1, 1, 0]);
  const blur = useTransform(p, [0, 0.3, 0.75, 1], [14, 0, 0, 10]);
  const filter = useMotionTemplate`blur(${blur}px)`;
  const scale = useTransform(p, [0, 1], [1.06, 0.98]);
  const line = useTransform(p, [0.15, 0.5], [0, 1]);
  if (reduce) {
    return (
      <section id={id} className="bg-black px-5 py-16 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-white/50">{numeral ? `${word} ${numeral}` : word}</p>
        <p className="mt-3 font-display text-4xl font-semibold text-white">{name}</p>
      </section>
    );
  }
  return (
    <section id={id} ref={ref} className="relative h-[170vh] bg-black">
      <div className="sticky top-0 flex h-svh items-center justify-center overflow-hidden px-6">
        <motion.div style={{ opacity, filter, scale }} className="text-center">
          <p className="font-mono text-xs uppercase tracking-[0.4em] text-[#E6C682] sm:text-sm">{numeral ? `${word} ${numeral}` : word}</p>
          <motion.span style={{ scaleX: line }} className="mx-auto mt-6 block h-px w-24 origin-center bg-white/40" />
          <p className="mt-6 font-display text-[11vw] font-semibold leading-[1] tracking-[-0.04em] text-white [text-wrap:balance] sm:text-7xl lg:text-8xl">{name}</p>
        </motion.div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Le générique de fin                                                 */
/* ------------------------------------------------------------------ */

/** Rôle → noms. Que des noms réels : les réseaux, routeurs, protocoles et fournisseurs que l'app utilise. */
export function Credits({ t }: { t: Dict }) {
  const reduce = useReducedMotionSafe();
  const ref = useRef<HTMLElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(2400);
  const [vh, setVh] = useState(800);
  useIso(() => {
    const m = () => {
      setH(list.current?.offsetHeight ?? 2400);
      setVh(window.innerHeight);
    };
    m();
    window.addEventListener('resize', m);
    return () => window.removeEventListener('resize', m);
  }, []);
  const p = useScroll({ target: ref, offset: ['start start', 'end end'] }).scrollYProgress;
  const y = useTransform(p, [0, 0.8], [vh, -h]);
  const endOpacity = useTransform(p, [0.8, 0.9], [0, 1]);

  const rows: [string, string][] = [
    [t.networks.label, 'Bitcoin · Ethereum · Solana · TON · Avalanche · Sei'],
    [t.how.steps[2].title, 'Jupiter · LI.FI · Relay · STON.fi'],
    [t.how.steps[3].title, 'Aave v3 · Lido · Rocket Pool · Benqi · Jito · Marinade · Tonstakers'],
    [t.stolen.s2.kicker, 'Alchemy · WalletConnect Verify · GoPlus'],
    [t.ai.kicker, 'OpenAI · Anthropic · Gemini · DeepSeek · Groq · OpenRouter · Together · Hugging Face'],
    [t.footer.transparency, `${t.footer.source} · ${t.footer.releases}`],
  ];

  const body = (
    <div ref={list} className="mx-auto max-w-2xl px-6 text-center">
      <Mark size={40} className="mx-auto text-[#E6C682]" />
      <p className="mt-6 font-display text-5xl font-semibold tracking-[-0.04em] text-white sm:text-6xl">{t.opening.title}</p>
      <p className="mt-3 text-white/55">{t.opening.sub}</p>
      <dl className="mt-24 space-y-14">
        {rows.map(([role, names]) => (
          <div key={role}>
            <dt className="font-mono text-[11px] uppercase tracking-[0.3em] text-white/45">{role}</dt>
            <dd className="mt-3 text-xl font-semibold leading-relaxed text-white sm:text-2xl">{names}</dd>
          </div>
        ))}
      </dl>
      <p className="mx-auto mt-24 max-w-md text-xl italic leading-relaxed text-white/80">« {t.vision.lines[t.vision.lines.length - 1]} »</p>
      <p className="mt-24 font-mono text-xs text-white/40">{t.footer.rights}</p>
    </div>
  );

  const final = (
    <div className="flex flex-col items-center gap-6 text-center">
      <Mark size={56} className="text-[#E6C682]" />
      <ApkPill label={t.download.cta} />
      <p className="flex gap-5 font-mono text-xs text-white/55">
        <a className="pointer-events-auto underline underline-offset-4 hover:text-white" href={RELEASES_URL} target="_blank" rel="noopener noreferrer">
          {t.download.verifyLink} ↗
        </a>
        <a className="pointer-events-auto underline underline-offset-4 hover:text-white" href={SOURCE_URL} target="_blank" rel="noopener noreferrer">
          {t.footer.source} ↗
        </a>
      </p>
    </div>
  );

  if (reduce) {
    return (
      <section id="generique" className="bg-black py-24">
        {body}
        <div className="mt-20">{final}</div>
      </section>
    );
  }
  return (
    <section id="generique" ref={ref} className="relative bg-black" style={{ height: h + vh * 2.2 }}>
      <div className="sticky top-0 h-svh overflow-hidden">
        <motion.div style={{ y }} className="absolute inset-x-0 top-0">
          {body}
        </motion.div>
        <motion.div style={{ opacity: endOpacity }} className="absolute inset-0 flex items-center justify-center">
          {final}
        </motion.div>
      </div>
    </section>
  );
}
