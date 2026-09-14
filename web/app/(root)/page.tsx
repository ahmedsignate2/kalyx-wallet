import React from 'react';
import { LangRedirect } from '../../components/lang-redirect';
import { LOCALES, LOCALE_NAMES } from '../../i18n';

/**
 * `/` : détecte la langue du navigateur (ou le choix mémorisé) et redirige vers `/xx/`.
 * Sans JavaScript : la liste des langues reste cliquable, et le <meta http-equiv> envoie vers /fr/.
 */
export default function RootPage() {
  return (
    <>
      <noscript>
        <meta httpEquiv="refresh" content="0; url=/fr/" />
      </noscript>
      <LangRedirect />
      <main className="flex min-h-screen flex-col items-center justify-center px-6 py-16 text-center">
        <p className="font-display text-3xl">Kalyx</p>
        <ul className="mt-8 grid max-w-md grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
          {LOCALES.map((l) => (
            <li key={l}>
              <a href={`/${l}/`} lang={l} hrefLang={l} className="text-mist underline-offset-4 hover:text-paper hover:underline">
                {LOCALE_NAMES[l]}
              </a>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
