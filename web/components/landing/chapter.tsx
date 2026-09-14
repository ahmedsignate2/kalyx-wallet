'use client';

import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion, useScroll, useSpring } from 'framer-motion';
import { Reveal, Rule } from './motion';
import type { Dict } from '../../i18n';

/** Les chapitres du film, dans l'ordre. `id` = ancre de section. */
export const CHAPTERS = [
  { id: 'prologue', numeral: '', key: 'prologue' },
  { id: 'fonctionnement', numeral: 'I', key: 'how' },
  { id: 'perdre', numeral: 'II', key: 'lose' },
  { id: 'voler', numeral: 'III', key: 'stolen' },
  { id: 'frais', numeral: 'IV', key: 'fees' },
  { id: 'vision', numeral: 'V', key: 'vision' },
  { id: 'telecharger', numeral: '', key: 'epilogue' },
] as const;

/** En-tête éditorial d'un chapitre : filet, numéro, titre serif, chapeau. */
export function ChapterHead({
  numeral,
  chapterWord,
  kicker,
  title,
  lead,
  tone = 'ink',
  align = 'left',
}: {
  numeral: string;
  chapterWord: string;
  kicker: string;
  title: React.ReactNode;
  lead?: string;
  tone?: 'ink' | 'paper';
  align?: 'left' | 'center';
}) {
  const onPaper = tone === 'paper';
  // `center` : centré partout ; sinon à gauche sur mobile, centré dès lg (ordinateur).
  const center = align === 'center';
  const ruleColor = onPaper ? 'bg-ink/40' : 'bg-sage';
  return (
    <div className={`max-w-3xl ${center ? 'mx-auto text-center' : 'md:mx-auto md:text-center'}`}>
      <p
        className={`mb-6 flex items-center gap-3 text-xs uppercase tracking-[0.22em] ${center ? 'justify-center' : 'md:justify-center'} ${onPaper ? 'text-ink/60' : 'text-sage'}`}
      >
        <Rule className={`w-8 ${ruleColor}`} />
        {numeral ? `${chapterWord} ${numeral} · ${kicker}` : kicker}
        <Rule className={`w-8 ${ruleColor} ${center ? '' : 'hidden md:block'}`} />
      </p>
      <Reveal
        as="h2"
        className={`font-display text-[2.1rem] font-light leading-[1.08] tracking-[-0.02em] sm:text-5xl lg:text-6xl ${onPaper ? 'text-ink' : 'text-paper'}`}
      >
        {title}
      </Reveal>
      {lead && (
        <Reveal
          as="p"
          delay={0.15}
          className={`mt-5 max-w-xl text-base font-light leading-relaxed sm:mt-6 sm:text-lg ${center ? 'mx-auto' : 'md:mx-auto'} ${onPaper ? 'text-ink/70' : 'text-mist'}`}
        >
          {lead}
        </Reveal>
      )}
    </div>
  );
}

/**
 * Rail des chapitres (écrans larges) + fil de progression sous la nav.
 * Le chapitre actif est celui dont la section occupe le centre de l'écran.
 */
export function ChapterRail({ t }: { t: Dict }) {
  const [active, setActive] = useState<string>(CHAPTERS[0].id);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 26 });

  useEffect(() => {
    const sections = CHAPTERS.map((c) => document.getElementById(c.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: '-45% 0px -45% 0px' },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  return (
    <>
      <motion.div
        aria-hidden
        className="fixed inset-x-0 top-16 z-40 h-px origin-left bg-sage/70"
        style={{ scaleX: reduce ? 1 : progress }}
      />
      <nav
        aria-label={t.nav.chapters}
        className="fixed left-6 top-1/2 z-40 hidden -translate-y-1/2 flex-col gap-3 2xl:flex rtl:left-auto rtl:right-6"
      >
        {CHAPTERS.map((c) => {
          const isActive = c.id === active;
          return (
            <a
              key={c.id}
              href={`#${c.id}`}
              className="group flex items-center gap-3 text-xs"
              aria-current={isActive ? 'true' : undefined}
              title={t.chapters[c.key]}
            >
              <span
                className={`h-px transition-all duration-500 ease-editorial ${isActive ? 'w-8 bg-sage' : 'w-4 bg-mist/40 group-hover:w-6'}`}
              />
              <span
                className={`font-display transition-colors duration-500 ${isActive ? 'text-paper' : 'text-mist/50 group-hover:text-mist'} mix-blend-difference`}
              >
                {c.numeral || (c.id === 'prologue' ? 'P' : 'É')}
              </span>
            </a>
          );
        })}
      </nav>
    </>
  );
}
