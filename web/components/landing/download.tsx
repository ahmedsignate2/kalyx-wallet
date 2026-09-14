import React from 'react';
import { Download as DownloadIcon, Send } from 'lucide-react';
import { Reveal, Rule } from './motion';
import type { Dict } from '../../i18n';

export function Download({ t }: { t: Dict }) {
  return (
    <section id="telecharger" className="scroll-mt-16 bg-ink px-5 py-24 sm:px-8 lg:py-36">
      <div className="mx-auto max-w-page text-center">
        <p className="mb-6 flex items-center justify-center gap-3 text-xs uppercase tracking-[0.22em] text-sage">
          <Rule className="w-8 bg-sage" />
          {t.download.kicker}
          <Rule className="w-8 bg-sage" />
        </p>
        <Reveal as="h2" className="mx-auto max-w-3xl font-display text-4xl font-light leading-[1.05] tracking-[-0.02em] text-paper sm:text-6xl">
          {t.download.title} <em className="italic text-sage">{t.download.titleEm}</em>
        </Reveal>
        <Reveal as="p" delay={0.15} className="mx-auto mt-6 max-w-md text-base font-light leading-relaxed text-mist">
          {t.download.sub}
        </Reveal>
        <Reveal delay={0.3} className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href="/kalyx-wallet.apk"
            download
            className="inline-flex h-12 items-center gap-2 rounded-full bg-paper px-7 text-sm font-medium text-ink transition-[background-color,transform] duration-200 ease-editorial hover:bg-bone active:scale-[0.97]"
          >
            <DownloadIcon className="h-4 w-4" />
            {t.download.cta}
          </a>
          <a
            href="https://t.me/kalyxntw"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 items-center gap-2 rounded-full border border-bone/20 px-6 text-sm font-medium text-paper transition-colors hover:border-bone/50"
          >
            <Send className="h-4 w-4" />
            {t.download.telegram}
          </a>
        </Reveal>
        <p className="mt-5 text-xs text-mist/70">{t.download.note}</p>
      </div>
    </section>
  );
}
