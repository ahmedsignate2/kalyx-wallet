'use client';

import React, { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChapterHead } from './chapter';
import { Item, Stagger } from './motion';
import type { Dict } from '../../i18n';

/*
 * Vérifié dans le code :
 *  - app/backup.tsx : mots masqués tant que le doigt n'est pas maintenu, FLAG_SECURE, pas de copier.
 *  - app/verify.tsx + src/domain/wallet/backupChallenge.ts : 3 mots demandés, pose `backupVerified`.
 *  - src/domain/backup/cloudBackup.ts : fichier chiffré côté client (scrypt N=2^15 + AES-256-GCM),
 *    stocké où l'utilisateur veut, inutile sans le mot de passe.
 */
const WORDS = ['ocean', 'planet', 'silent', 'orbit', 'north', 'garden', 'river', 'pulse', 'velvet', 'cradle', 'mirror', 'fossil'];

export function NeverLose({ t }: { t: Dict }) {
  const reduce = useReducedMotion();
  const [held, setHeld] = useState(false);

  return (
    <section id="perdre" className="scroll-mt-16 bg-paper px-5 py-24 text-ink sm:px-8 lg:py-32">
      <div className="mx-auto max-w-page">
        <ChapterHead
          tone="paper"
          numeral="II"
          chapterWord={t.chapters.chapter}
          kicker={t.lose.kicker}
          title={
            <>
              {t.lose.title} <em className="italic">{t.lose.titleEm}</em>
            </>
          }
          lead={t.lose.lead}
        />

        <div className="mt-20 grid gap-16 lg:grid-cols-[1fr_1fr] lg:gap-24">
          {/* Le papier : maintenir pour révéler, comme dans l'app. */}
          <div className="lg:sticky lg:top-28 lg:self-start">
            <div
              role="button"
              tabIndex={0}
              aria-pressed={held}
              aria-label={t.lose.holdAria}
              onPointerDown={() => setHeld(true)}
              onPointerUp={() => setHeld(false)}
              onPointerLeave={() => setHeld(false)}
              onPointerCancel={() => setHeld(false)}
              onKeyDown={(e) => e.key === ' ' && setHeld(true)}
              onKeyUp={(e) => e.key === ' ' && setHeld(false)}
              className="select-none rounded-2xl border border-ink/15 bg-bone p-6 shadow-[0_24px_60px_-30px_rgba(8,10,9,0.35)] sm:p-8"
              style={{ touchAction: 'none' }}
            >
              <p className="mb-6 flex items-center justify-between text-xs uppercase tracking-[0.18em] text-ink/60">
                {t.lose.cardLabel}
                <span className="font-display normal-case italic tracking-normal">{t.lose.cardExample}</span>
              </p>
              <ol className="grid grid-cols-2 gap-x-8 sm:grid-cols-3">
                {WORDS.map((w, i) => (
                  <li key={w} className="flex items-baseline gap-2 border-b border-ink/10 py-2.5">
                    <span className="w-5 font-display text-xs text-ink/40">{i + 1}</span>
                    <motion.span
                      className="font-display text-lg text-ink"
                      animate={reduce ? { filter: held ? 'blur(0px)' : 'blur(7px)' } : { filter: held ? 'blur(0px)' : 'blur(7px)', opacity: held ? 1 : 0.55 }}
                      transition={{ duration: 0.35, delay: held ? i * 0.03 : 0 }}
                    >
                      {w}
                    </motion.span>
                  </li>
                ))}
              </ol>
              <p className="mt-6 text-center text-sm text-ink/60">
                {held ? t.lose.release : t.lose.hold}
              </p>
            </div>
          </div>

          <Stagger as="ol" className="grid gap-12" gap={0.12}>
            {t.lose.rituals.map((r, i) => (
              <Item key={r.title} as="li" className="grid grid-cols-[3rem_1fr] gap-4">
                <span className="font-display text-2xl text-ink/40">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <h3 className="font-display text-3xl leading-tight">{r.title}</h3>
                  <p className="mt-3 text-base font-light leading-relaxed text-ink/75">{r.text}</p>
                </div>
              </Item>
            ))}
          </Stagger>
        </div>
      </div>
    </section>
  );
}
