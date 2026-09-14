import React from 'react';
import { LangRedirect } from '../../../components/lang-redirect';
import { LOCALES, LOCALE_NAMES } from '../../../i18n';

/** Ancienne URL `/privacy` (liée depuis l'app) : aiguillage vers la langue du visiteur. */
export default function PrivacyRedirect() {
  return (
    <>
      <noscript>
        <meta httpEquiv="refresh" content="0; url=/fr/privacy/" />
      </noscript>
      <LangRedirect path="privacy/" />
      <main className="flex min-h-screen flex-col items-center justify-center px-6 py-16 text-center">
        <p className="font-display text-3xl">Kalyx</p>
        <ul className="mt-8 grid max-w-md grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
          {LOCALES.map((l) => (
            <li key={l}>
              <a href={`/${l}/privacy/`} lang={l} hrefLang={l} className="text-mist underline-offset-4 hover:text-paper hover:underline">
                {LOCALE_NAMES[l]}
              </a>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
