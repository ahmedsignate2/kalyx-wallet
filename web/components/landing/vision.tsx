'use client';

import React, { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from 'framer-motion';
import { ChapterHead } from './chapter';
import { Reveal } from './motion';
import type { Dict } from '../../i18n';

/*
 * Le manifeste, tiré de docs/07-DIFFERENCIATION.md et docs/DESIGN.md §0. Chiffres :
 * 15 fichiers dans locales/, 65 fichiers *.test.ts dans src/ (2026-09-14).
 */
function Line({ text, index, n, progress }: { text: string; index: number; n: number; progress: MotionValue<number> }) {
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

export function Vision({ t }: { t: Dict }) {
  const LINES = t.vision.lines;
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.75', 'end 0.45'] });

  return (
    <section id="vision" className="scroll-mt-16 bg-paper px-5 py-24 text-ink sm:px-8 lg:py-32">
      <div className="mx-auto max-w-page">
        <ChapterHead
          tone="paper"
          numeral="V"
          chapterWord={t.chapters.chapter}
          kicker={t.vision.kicker}
          title={
            <>
              {t.vision.title} <em className="italic">{t.vision.titleEm}</em>
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
              <Line key={l} text={l} index={i} n={LINES.length} progress={scrollYProgress} />
            ),
          )}
        </div>

        <Reveal className="mt-20 grid grid-cols-2 gap-8 border-t border-ink/15 pt-10 sm:grid-cols-4">
          {['63', '15', '65', '0'].map((v, i) => ({ v, l: t.vision.stats[i] })).map((s) => (
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
