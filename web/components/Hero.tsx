'use client';

import React from 'react';
import { Download } from 'lucide-react';
import { PhoneMockup } from './PhoneMockup';

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-hero-gradient px-5 pb-0 pt-28 sm:px-8 sm:pt-36 lg:pt-40">
      <div className="pointer-events-none absolute left-1/2 top-16 h-80 w-80 -translate-x-1/2 rounded-full bg-violet-500/15 blur-3xl" />
      <div className="relative z-10 mx-auto max-w-5xl text-center">
        <div className="mb-6 inline-flex rounded-full border border-white/15 bg-black/15 px-4 py-1.5 text-[11px] font-medium text-emerald-50">
          Kalyx 2.0 <span className="mx-2 text-emerald-200/40">•</span> Multi-Chain Non-Custodial
        </div>
        <h1 className="mx-auto max-w-4xl text-4xl font-semibold leading-[1.05] tracking-[-0.03em] text-white sm:text-6xl lg:text-7xl">
          Là où vit votre crypto
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-sm text-emerald-100/70 sm:text-base">
          Ethereum, Solana, Bitcoin. Vos clés, votre contrôle absolu.
        </p>
        <a href="/kalyx-wallet.apk" download className="mt-7 inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-bold uppercase tracking-wide text-[#0B2B26] shadow-xl shadow-black/20 transition hover:-translate-y-1 hover:bg-lime-100">
          <Download className="h-4 w-4" />
          Téléchargez Kalyx
        </a>
        <p className="mt-3 text-[11px] text-emerald-100/50">Disponible prochainement sur iOS &amp; Chrome</p>
      </div>
      <div className="relative mx-auto mt-6 flex h-[530px] max-w-3xl items-start justify-center sm:mt-10 sm:h-[650px]">
        <div className="pointer-events-none absolute top-14 h-72 w-72 rounded-full bg-gradient-to-tr from-purple-600/30 to-cyan-500/20 blur-3xl sm:h-96 sm:w-96" />
        <div className="relative z-10">
          <PhoneMockup />
        </div>
      </div>
    </section>
  );
}
