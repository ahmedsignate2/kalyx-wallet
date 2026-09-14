'use client';

import React, { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from 'framer-motion';
import { ChapterHead } from './chapter';
import { Reveal } from './motion';

/*
 * Le manifeste, tiré de docs/07-DIFFERENCIATION.md et docs/DESIGN.md §0. Chiffres :
 * 15 fichiers dans locales/, 65 fichiers *.test.ts dans src/ (2026-09-14).
 */
const LINES = [
  'Un wallet qui vous protège, et que vous comprenez.',
  'Aucun serveur ne voit une clé. Jamais. Ce n’est pas une promesse marketing, c’est l’architecture.',
  'Chaque signature est expliquée en français avant le tap — parce que c’est là que les gens se font vider.',
  'La vitesse se ressent : l’accueil s’ouvre depuis le cache, avant que le réseau réponde.',
  'Si un élément ne sert ni la compréhension ni la confiance, on le retire.',
  'Le fiat, les cartes, un jour peut-être — isolés, régulés, jamais mêlés au cœur.',
  'Une seule personne, un code testé, quinze langues, et l’envie de bien faire.',
];

function Line({ text, index, progress }: { text: string; index: number; progress: MotionValue<number> }) {
  const n = LINES.length;
  const start = index / n;
  const end = (index + 0.7) / n;
  const opacity = useTransform(progress, [start, end], [0.16, 1]);
  const x = useTransform(progress, [start, end], [12, 0]);
  return (
    <motion.p style={{ opacity, x }} className="font-display text-2xl font-light leading-snug text-ink sm:text-3xl lg:text-[2.6rem] lg:leading-[1.2]">
      {text}
    </motion.p>
  );
}

export function Vision() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.75', 'end 0.45'] });

  return (
    <section id="vision" className="scroll-mt-16 bg-paper px-5 py-24 text-ink sm:px-8 lg:py-32">
      <div className="mx-auto max-w-page">
        <ChapterHead
          tone="paper"
          numeral="V"
          kicker="Ce que nous voulons"
          title={
            <>
              Pourquoi quitter le wallet <em className="italic">que tout le monde a.</em>
            </>
          }
        />

        <div ref={ref} className="mt-16 max-w-4xl space-y-8">
          {LINES.map((l, i) =>
            reduce ? (
              <p key={l} className="font-display text-2xl font-light leading-snug sm:text-3xl lg:text-[2.6rem] lg:leading-[1.2]">
                {l}
              </p>
            ) : (
              <Line key={l} text={l} index={i} progress={scrollYProgress} />
            ),
          )}
        </div>

        <Reveal className="mt-20 grid grid-cols-2 gap-8 border-t border-ink/15 pt-10 sm:grid-cols-4">
          {[
            { v: '63', l: 'réseaux' },
            { v: '15', l: 'langues' },
            { v: '65', l: 'suites de tests' },
            { v: '0', l: 'serveur qui voit une clé' },
          ].map((s) => (
            <div key={s.l}>
              <p className="font-display text-5xl font-light leading-none">{s.v}</p>
              <p className="mt-2 text-sm text-ink/60">{s.l}</p>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
