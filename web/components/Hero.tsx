'use client';

import React from 'react';
import { ArrowUpRight, Download, MessageCircle } from 'lucide-react';
import { PhoneMockup } from './PhoneMockup';

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-hero-gradient pt-28 pb-8 sm:pt-36 sm:pb-16 lg:min-h-[820px] lg:pt-44">
      <div className="pointer-events-none absolute left-1/2 top-0 h-96 w-[38rem] -translate-x-1/2 rounded-full bg-violet-600/10 blur-3xl" />
      <div className="mx-auto grid max-w-7xl items-start gap-3 px-5 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-4 lg:px-10">
        <div className="relative z-10 text-center lg:text-left">
          <div className="mb-5 inline-flex rounded-full border border-white/[0.1] bg-black/20 px-3 py-1 text-[11px] font-medium tracking-[-0.01em] text-neutral-300 sm:mb-7 sm:px-3.5 sm:py-1.5 sm:text-xs">
            Kalyx 2.0 <span className="mx-2 text-neutral-600">•</span> Multi-Chain Non-Custodial
          </div>
          <h1 className="mx-auto max-w-2xl bg-gradient-to-b from-white to-neutral-300 bg-clip-text text-3xl font-semibold leading-tight tracking-[-0.02em] text-transparent sm:text-5xl lg:mx-0 lg:text-6xl">
            Votre passerelle souveraine vers le Web3.
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm font-normal leading-relaxed text-neutral-400 sm:max-w-lg sm:text-base lg:mx-0">
            Ethereum, Solana, Bitcoin. Vos clés, votre contrôle absolu.
          </p>
          <div className="mt-6 flex flex-col items-center gap-3 sm:mt-8 sm:flex-row lg:items-center">
            <a href="/kalyx-wallet.apk" download className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white px-6 py-3 text-sm font-medium text-slate-950 shadow-lg shadow-black/20 transition hover:-translate-y-0.5 hover:bg-neutral-100">
              <Download className="h-4 w-4" />
              Télécharger l&apos;APK (Android)
            </a>
            <a href="https://t.me/kalyxntw" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-400 transition hover:text-white">
              <MessageCircle className="h-4 w-4" />
              Telegram
              <ArrowUpRight className="h-3.5 w-3.5 text-neutral-600" />
            </a>
          </div>
          <p className="mt-3 text-[11px] text-neutral-500">Disponible prochainement sur iOS &amp; Chrome</p>
        </div>

        <div className="relative -mt-1 flex min-h-[500px] items-start justify-center lg:mt-0 lg:min-h-[680px] lg:items-center lg:justify-end">
          <div className="pointer-events-none absolute top-16 h-72 w-72 rounded-full bg-gradient-to-tr from-purple-600/30 to-cyan-500/20 blur-3xl sm:h-96 sm:w-96 lg:top-1/2 lg:-translate-y-1/2" />
          <PhoneMockup />
        </div>
      </div>
    </section>
  );
}
