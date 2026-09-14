import React from 'react';
import { ArrowRight, Download, Send } from 'lucide-react';
import { Reveal } from './Reveal';

export function DownloadSection() {
  return (
    <section id="download" className="scroll-mt-16 px-5 py-20 sm:px-8 lg:py-28">
      {/* Ancre « download » : le halo du site se rallume derrière le geste final. */}
      <Reveal>
        <div data-halo="download" className="relative mx-auto max-w-4xl rounded-sheet bg-nuit ring-1 ring-trait">
          <div className="relative flex flex-col items-start gap-8 p-8 sm:p-12 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="mb-3 text-sm font-medium text-brume">Android, en APK direct</p>
              <h2 className="text-3xl font-semibold leading-none tracking-[-0.03em] text-lueur sm:text-5xl">
                Commence maintenant.
              </h2>
              <p className="mt-4 max-w-md text-base text-brume">
                Crée un portefeuille en moins d’une minute. Ta phrase reste chez toi, la sauvegarde peut attendre.
              </p>
            </div>
            <div className="flex w-full shrink-0 flex-col gap-3 sm:w-auto">
              <a
                href="/kalyx-wallet.apk"
                download
                className="inline-flex h-14 items-center justify-center gap-2 rounded-button bg-lumiere px-6 text-base font-semibold text-encre transition-transform duration-150 hover:bg-white active:scale-[0.96]"
              >
                <Download className="h-4 w-4" />
                Télécharger l’APK
                <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href="https://t.me/kalyxntw"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-input bg-orbite px-5 text-sm font-medium text-lueur ring-1 ring-trait transition-colors duration-150 hover:bg-crepuscule"
              >
                <Send className="h-4 w-4" />
                Suivre le déploiement sur Telegram
              </a>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
