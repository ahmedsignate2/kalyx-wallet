import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Mail } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Navbar } from './Navbar';
import { Footer } from './Footer';

export interface LegalSection {
  id: string;
  title: string;
  body: string;
}

/** Enveloppe commune des pages légales : les textes restent dans chaque page. */
export function LegalPage({
  icon: Icon,
  title,
  intro,
  meta,
  sections,
  contactTitle,
  contactText,
}: {
  icon: LucideIcon;
  title: string;
  intro: string;
  meta: string[];
  sections: LegalSection[];
  contactTitle: string;
  contactText: string;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1 px-5 pb-24 pt-28 sm:px-8 sm:pt-32">
        <div className="mx-auto max-w-3xl">
          <Link
            href="/"
            className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-brume transition-colors hover:text-lueur"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour à l’accueil
          </Link>

          <header className="border-b border-trait pb-8">
            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-input bg-nuit text-lueur ring-1 ring-trait">
              <Icon className="h-6 w-6" strokeWidth={1.75} />
            </div>
            <h1 className="text-3xl font-semibold tracking-[-0.03em] text-lueur sm:text-5xl">{title}</h1>
            <p className="mt-4 text-base leading-relaxed text-brume">{intro}</p>
            <p className="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-xs text-cendre">
              {meta.map((m) => (
                <span key={m}>{m}</span>
              ))}
            </p>
          </header>

          <nav aria-label="Sommaire" className="my-10 rounded-container bg-nuit p-6 ring-1 ring-trait">
            <h2 className="mb-3 text-sm font-semibold text-lueur">Sommaire</h2>
            <ol className="grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-2">
              {sections.map((sec) => (
                <li key={sec.id}>
                  <a
                    href={`#${sec.id}`}
                    className="block truncate py-0.5 text-brume transition-colors hover:text-lueur"
                  >
                    {sec.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="space-y-10">
            {sections.map((sec) => (
              <section key={sec.id} id={sec.id} className="scroll-mt-24">
                <h3 className="mb-3 text-xl font-semibold tracking-[-0.01em] text-lueur">{sec.title}</h3>
                <div className="whitespace-pre-line text-sm leading-relaxed text-brume">{sec.body}</div>
              </section>
            ))}
          </div>

          <div className="mt-14 flex flex-col gap-6 rounded-container bg-nuit p-7 ring-1 ring-trait sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="text-lg font-semibold text-lueur">{contactTitle}</h4>
              <p className="mt-1 text-sm text-brume">{contactText}</p>
            </div>
            <a
              href="mailto:support@kalyxwallet.com"
              className="inline-flex h-12 shrink-0 items-center gap-2 rounded-input bg-orbite px-5 text-sm font-medium text-lueur ring-1 ring-trait transition-colors duration-150 hover:bg-crepuscule"
            >
              <Mail className="h-4 w-4" />
              support@kalyxwallet.com
            </a>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
