import React from 'react';
import { ChapterHead } from './chapter';
import { Item, Reveal, Stagger } from './motion';
import type { Dict } from '../../i18n';

/*
 * Vérifié dans le code :
 *  - lib/aiConfig.ts : 8 fournisseurs prédéfinis (deepseek, openai, anthropic, gemini, groq,
 *    openrouter, together, huggingface) + 1 endpoint "custom" compatible OpenAI → 9 au total.
 *  - lib/aiStore.ts : la clé API est chiffrée sur l'appareil ; désactivée par défaut (isEnabled=false).
 *  - Aucun serveur Kalyx dans la boucle : la requête part du téléphone vers l'URL du fournisseur (buildAiRequestParams).
 */
export function Ai({ t }: { t: Dict }) {
  return (
    <section id="copilote" className="scroll-mt-16 bg-ink px-5 py-20 sm:px-8 sm:py-24 lg:py-32">
      <div className="mx-auto max-w-page">
        <ChapterHead
          numeral="IV"
          chapterWord={t.chapters.chapter}
          kicker={t.ai.kicker}
          title={
            <>
              {t.ai.title} <em className="italic text-sage">{t.ai.titleEm}</em>
            </>
          }
          lead={t.ai.lead}
        />

        <Stagger as="ul" className="mt-16 divide-y divide-bone/10 border-y border-bone/10" gap={0.1}>
          {t.ai.items.map((f) => (
            <Item key={f.label} as="li" className="grid grid-cols-[minmax(6.5rem,auto)_1fr] items-center gap-x-5 gap-y-2 py-6 sm:grid-cols-[10rem_1fr] sm:gap-8 sm:py-7 lg:grid-cols-[14rem_1fr_1fr]">
              <span className="font-display text-4xl font-light leading-none text-paper sm:text-6xl">{f.value}</span>
              <span className="self-center text-base text-bone sm:text-lg">{f.label}</span>
              <span className="col-span-2 self-center text-sm font-light leading-relaxed text-mist sm:col-span-1 sm:col-start-2 lg:col-start-3">{f.note}</span>
            </Item>
          ))}
        </Stagger>

        <Reveal className="mt-12 grid gap-6 lg:grid-cols-2 md:text-center">
          <p className="text-base font-light leading-relaxed text-mist">
            {t.ai.p1a}
            <span className="text-bone">{t.ai.p1em}</span>
            {t.ai.p1b}
          </p>
          <p className="text-base font-light leading-relaxed text-mist">{t.ai.p2}</p>
        </Reveal>
      </div>
    </section>
  );
}
