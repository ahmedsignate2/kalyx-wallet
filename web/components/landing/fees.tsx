import React from 'react';
import { ChapterHead } from './chapter';
import { Item, Reveal, Stagger } from './motion';
import type { Dict } from '../../i18n';

/*
 * Vérifié dans le code :
 *  - src/domain/swap/lifi.ts : KALYX_FEE = 0,3 % (intégrateur déclaré), EARN_FEE = 0 %.
 *  - src/domain/swap/jupiter.ts : aucun platformFee → 0 % sur Solana.
 *  - Envoyer / recevoir : aucun frais Kalyx, seulement les frais réseau, affichés en devise
 *    avant la signature (app/send.tsx, gas manquant indiqué en devise).
 */
export function Fees({ t }: { t: Dict }) {
  return (
    <section id="frais" className="scroll-mt-16 bg-ink-2 px-5 py-20 sm:px-8 sm:py-24 lg:py-32">
      <div className="mx-auto max-w-page">
        <ChapterHead
          numeral="IV"
          chapterWord={t.chapters.chapter}
          kicker={t.fees.kicker}
          title={
            <>
              {t.fees.title} <em className="italic text-sage">{t.fees.titleEm}</em>
            </>
          }
          lead={t.fees.lead}
        />

        <Stagger as="ul" className="mt-16 divide-y divide-bone/10 border-y border-bone/10" gap={0.1}>
          {t.fees.items.map((f) => (
            <Item key={f.label} as="li" className="grid grid-cols-[minmax(6.5rem,auto)_1fr] items-center gap-x-5 gap-y-2 py-6 sm:grid-cols-[10rem_1fr] sm:gap-8 sm:py-7 lg:grid-cols-[14rem_1fr_1fr]">
              <span className="font-display text-4xl font-light leading-none text-paper sm:text-6xl">{f.value}</span>
              <span className="self-center text-base text-bone sm:text-lg">{f.label}</span>
              <span className="col-span-2 self-center text-sm font-light leading-relaxed text-mist sm:col-span-1 sm:col-start-2 lg:col-start-3">{f.note}</span>
            </Item>
          ))}
        </Stagger>

        <Reveal className="mt-12 grid gap-6 lg:grid-cols-2">
          <p className="text-base font-light leading-relaxed text-mist">
            {t.fees.p1a} <span className="text-bone">{t.fees.p1em}</span>
            {t.fees.p1b}
          </p>
          <p className="text-base font-light leading-relaxed text-mist">{t.fees.p2}</p>
        </Reveal>
      </div>
    </section>
  );
}
