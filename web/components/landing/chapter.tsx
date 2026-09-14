'use client';

import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion, useScroll, useSpring } from 'framer-motion';
import { Reveal, Rule } from './motion';

/** Les chapitres du film, dans l'ordre. `id` = ancre de section. */
export const CHAPTERS = [
  { id: 'prologue', numeral: '', title: 'Prologue' },
  { id: 'fonctionnement', numeral: 'I', title: 'Comment ça marche' },
  { id: 'perdre', numeral: 'II', title: 'Ne jamais la perdre' },
  { id: 'voler', numeral: 'III', title: 'Ne jamais se faire voler' },
  { id: 'frais', numeral: 'IV', title: 'Les frais, sans détour' },
  { id: 'vision', numeral: 'V', title: 'Ce que nous voulons' },
  { id: 'telecharger', numeral: '', title: 'Épilogue' },
] as const;

/** En-tête éditorial d'un chapitre : filet, numéro, titre serif, chapeau. */
export function ChapterHead({
  numeral,
  kicker,
  title,
  lead,
  tone = 'ink',
  align = 'left',
}: {
  numeral: string;
  kicker: string;
  title: React.ReactNode;
  lead?: string;
  tone?: 'ink' | 'paper';
  align?: 'left' | 'center';
}) {
  const onPaper = tone === 'paper';
  const center = align === 'center';
  return (
    <div className={`${center ? 'mx-auto text-center' : ''} max-w-3xl`}>
      <p
        className={`mb-6 flex items-center gap-3 text-xs uppercase tracking-[0.22em] ${center ? 'justify-center' : ''} ${onPaper ? 'text-ink/60' : 'text-sage'}`}
      >
        <Rule className={`w-8 ${onPaper ? 'bg-ink/40' : 'bg-sage'}`} />
        {numeral ? `Chapitre ${numeral} · ${kicker}` : kicker}
        {center && <Rule className={`w-8 ${onPaper ? 'bg-ink/40' : 'bg-sage'}`} />}
      </p>
      <Reveal
        as="h2"
        className={`font-display text-4xl font-light leading-[1.05] tracking-[-0.02em] sm:text-5xl lg:text-6xl ${onPaper ? 'text-ink' : 'text-paper'}`}
      >
        {title}
      </Reveal>
      {lead && (
        <Reveal
          as="p"
          delay={0.15}
          className={`mt-6 max-w-xl text-lg font-light leading-relaxed ${center ? 'mx-auto' : ''} ${onPaper ? 'text-ink/70' : 'text-mist'}`}
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
export function ChapterRail() {
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
        aria-label="Chapitres"
        className="fixed left-6 top-1/2 z-40 hidden -translate-y-1/2 flex-col gap-3 xl:flex"
      >
        {CHAPTERS.map((c) => {
          const isActive = c.id === active;
          return (
            <a
              key={c.id}
              href={`#${c.id}`}
              className="group flex items-center gap-3 text-xs"
              aria-current={isActive ? 'true' : undefined}
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
