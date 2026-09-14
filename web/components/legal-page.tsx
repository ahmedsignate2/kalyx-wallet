import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Mail } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Nav } from './landing/nav';
import { Footer } from './landing/footer';
import type { Dict, Locale } from '../i18n';

export interface LegalSection {
  id: string;
  title: string;
  body: string;
}

/** Enveloppe commune des pages légales, sur papier : les textes restent dans chaque page. */
export function LegalPage({
  t,
  lang,
  icon: Icon,
  title,
  intro,
  meta,
  sections,
  contactTitle,
  contactText,
}: {
  t: Dict;
  lang: Locale;
  icon: LucideIcon;
  title: string;
  intro: string;
  meta: string[];
  sections: LegalSection[];
  contactTitle: string;
  contactText: string;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <Nav t={t} lang={lang} />
      <main className="flex-1 px-5 pb-24 pt-28 sm:px-8 sm:pt-32">
        <div className="mx-auto max-w-3xl">
          <Link href={`/${lang}/`} className="mb-10 inline-flex items-center gap-2 text-sm text-ink/60 transition-colors hover:text-ink">
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
            {t.legal.back}
          </Link>

          <header className="border-b border-ink/15 pb-10">
            <Icon className="mb-6 h-7 w-7 text-ink/60" strokeWidth={1.5} />
            <h1 className="font-display text-4xl font-light leading-[1.05] tracking-[-0.02em] sm:text-6xl">{title}</h1>
            <p className="mt-6 max-w-2xl text-lg font-light leading-relaxed text-ink/70">{intro}</p>
            <p className="mt-6 flex flex-wrap gap-x-5 gap-y-1 text-xs uppercase tracking-[0.18em] text-ink/50">
              {meta.map((m) => (
                <span key={m}>{m}</span>
              ))}
            </p>
          </header>

          {lang !== 'fr' && <p className="mt-6 rounded-xl border border-ink/15 bg-bone px-4 py-3 text-sm text-ink/70">{t.legal.notice}</p>}

          <nav aria-label={t.legal.toc} className="my-10 border-b border-ink/15 pb-10">
            <h2 className="mb-4 text-xs uppercase tracking-[0.18em] text-ink/50">{t.legal.toc}</h2>
            <ol className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              {sections.map((sec) => (
                <li key={sec.id}>
                  <a href={`#${sec.id}`} className="block truncate text-ink/70 transition-colors hover:text-ink">
                    {sec.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="space-y-12" lang="fr" dir="ltr">
            {sections.map((sec) => (
              <section key={sec.id} id={sec.id} className="scroll-mt-24">
                <h3 className="mb-4 font-display text-2xl leading-tight">{sec.title}</h3>
                <div className="whitespace-pre-line text-[15px] font-light leading-relaxed text-ink/75">{sec.body}</div>
              </section>
            ))}
          </div>

          <div className="mt-16 flex flex-col gap-6 border-t border-ink/15 pt-10 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="font-display text-2xl">{contactTitle}</h4>
              <p className="mt-2 text-sm font-light text-ink/70">{contactText}</p>
            </div>
            <a
              href="mailto:support@kalyxwallet.com"
              className="inline-flex h-12 shrink-0 items-center gap-2 rounded-full bg-ink px-6 text-sm font-medium text-paper transition-colors hover:bg-ink-3"
            >
              <Mail className="h-4 w-4" />
              support@kalyxwallet.com
            </a>
          </div>
        </div>
      </main>
      <Footer t={t} lang={lang} />
    </div>
  );
}
