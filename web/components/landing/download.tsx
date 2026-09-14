import React from 'react';
import { Download as DownloadIcon, Send } from 'lucide-react';

export function Download() {
  return (
    <section id="telecharger" className="scroll-mt-16 bg-ink px-5 py-24 sm:px-8 lg:py-36">
      <div className="mx-auto max-w-page text-center">
        <p className="mb-6 flex items-center justify-center gap-3 text-xs uppercase tracking-[0.22em] text-sage">
          <span className="h-px w-8 bg-sage" />
          Acte IV · Télécharger
          <span className="h-px w-8 bg-sage" />
        </p>
        <h2 className="mx-auto max-w-3xl font-display text-4xl font-light leading-[1.05] tracking-[-0.02em] text-paper sm:text-6xl">
          Vos clés. Votre téléphone. <em className="italic text-sage">Rien d’autre.</em>
        </h2>
        <p className="mx-auto mt-6 max-w-md text-base font-light leading-relaxed text-mist">
          Kalyx est gratuit, sans compte et sans abonnement. Créez un portefeuille en moins d’une minute.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href="/kalyx-wallet.apk"
            download
            className="inline-flex h-12 items-center gap-2 rounded-full bg-paper px-7 text-sm font-medium text-ink transition-colors hover:bg-bone"
          >
            <DownloadIcon className="h-4 w-4" />
            Télécharger l’APK Android
          </a>
          <a
            href="https://t.me/kalyxntw"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 items-center gap-2 rounded-full border border-bone/20 px-6 text-sm font-medium text-paper transition-colors hover:border-bone/50"
          >
            <Send className="h-4 w-4" />
            Suivre sur Telegram
          </a>
        </div>
        <p className="mt-5 text-xs text-mist/70">iOS et extension navigateur à venir.</p>
      </div>
    </section>
  );
}
