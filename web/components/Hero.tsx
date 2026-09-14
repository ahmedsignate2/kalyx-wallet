import React from 'react';
import { Download } from 'lucide-react';
import { PhoneMockup } from './PhoneMockup';
import { Reveal } from './Reveal';

export function Hero() {
  return (
    <section className="relative overflow-hidden px-5 pt-28 sm:px-8 sm:pt-36 lg:pt-40">
      <Reveal className="relative z-10 mx-auto max-w-3xl text-center">
        <p className="mb-6 inline-flex items-center gap-2 rounded-chip border border-trait bg-nuit/60 px-3 py-1.5 text-xs font-medium text-brume">
          Non-custodial
          <span className="text-cendre">·</span>
          Ethereum, Solana, Bitcoin
        </p>
        <h1 className="mx-auto text-4xl font-semibold leading-[1.05] tracking-[-0.03em] text-lueur sm:text-6xl lg:text-7xl">
          Là où vit ta crypto
        </h1>
        <p className="mx-auto mt-5 max-w-md text-base text-brume sm:text-lg">
          Tes clés restent sur ton téléphone. Tu vois ce que tu signes, avant de signer.
        </p>
        <a
          href="/kalyx-wallet.apk"
          download
          className="mt-8 inline-flex h-14 items-center gap-2 rounded-button bg-lumiere px-7 text-base font-semibold text-encre transition-transform duration-150 hover:bg-white active:scale-[0.96]"
        >
          <Download className="h-4 w-4" />
          Télécharger Kalyx
        </a>
        <p className="mt-3 text-xs text-cendre">Android · iOS et extension navigateur à venir</p>
      </Reveal>

      {/* Ancre « hero » : le halo du site (ScrollHalo) naît derrière le haut du téléphone. */}
      <div
        data-halo="hero"
        className="relative mx-auto mt-10 flex h-[520px] max-w-3xl items-start justify-center sm:mt-14 sm:h-[640px]"
      >
        <Reveal delay={0.15} className="relative z-10">
          <PhoneMockup />
        </Reveal>
        {/* Fond de l'Encre qui reprend le dessus en bas du téléphone. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-40 bg-gradient-to-t from-encre to-transparent"
        />
      </div>
    </section>
  );
}
