'use client';

import React from 'react';
import { ArrowUpRight, Download, MessageCircle } from 'lucide-react';
import { PhoneMockup } from './PhoneMockup';

export function Hero() {
  return (
    <section className="relative min-h-[760px] overflow-hidden bg-hero-gradient pt-32 pb-16 lg:min-h-[820px] lg:pt-44">
      <div className="absolute left-1/2 top-24 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-primary/10 blur-[150px] lg:left-[70%] lg:top-28" />
      <div className="mx-auto grid max-w-7xl items-center gap-16 px-6 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-4 lg:px-10">
        <div className="relative z-10 max-w-2xl text-center lg:text-left">
          <div className="mb-7 inline-flex rounded-full bg-white/[0.05] px-3.5 py-1.5 text-xs font-medium text-slate-300">
            Kalyx 2.0 <span className="mx-2 text-slate-600">•</span> Non-custodial Web3 Wallet
          </div>
          <h1 className="text-5xl font-bold leading-[0.98] tracking-[-0.055em] text-white sm:text-7xl lg:text-[5.8rem]">
            Un seul portefeuille pour tout votre <span className="text-slate-400">Web3.</span>
          </h1>
          <p className="mx-auto mt-8 max-w-lg text-lg leading-relaxed text-neutral-400 lg:mx-0">
            Gérez vos actifs sur Ethereum, Solana et Bitcoin en toute souveraineté. Vos clés restent sur votre appareil. Zéro compromis.
          </p>
          <div className="mt-10 flex flex-col items-center gap-5 sm:flex-row lg:items-center">
            <a href="/kalyx-wallet.apk" download className="inline-flex w-full items-center justify-center gap-2.5 rounded-2xl bg-white px-6 py-4 text-sm font-bold text-slate-950 shadow-2xl shadow-black/25 transition hover:-translate-y-0.5 hover:bg-slate-100 sm:w-auto">
              <Download className="h-5 w-5" />
              Télécharger pour Android
            </a>
            <a href="https://t.me/kalyxntw" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-300 transition hover:text-white">
              <MessageCircle className="h-4 w-4" />
              Rejoindre la communauté
              <ArrowUpRight className="h-4 w-4 text-slate-500" />
            </a>
          </div>
        </div>
        <div className="relative flex min-h-[500px] items-center justify-center lg:min-h-[680px] lg:justify-end">
          <div className="absolute h-[420px] w-[420px] rounded-full bg-gradient-to-br from-primary/20 via-cyan/10 to-transparent blur-[90px]" />
          <PhoneMockup />
        </div>
      </div>
    </section>
  );
}
