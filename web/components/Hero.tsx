'use client';

import React from 'react';
import { ArrowRight, Download, Shield, Sparkles, Smartphone } from 'lucide-react';
import { PhoneMockup } from './PhoneMockup';

export function Hero() {
  return (
    <section className="relative pt-28 pb-20 lg:pt-36 lg:pb-28 overflow-hidden bg-hero-gradient">
      {/* Background Decorative Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f293715_1px,transparent_1px),linear-gradient(to_bottom,#1f293715_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          {/* Left Column: Copy & CTAs */}
          <div className="lg:col-span-7 flex flex-col items-center lg:items-start text-center lg:text-left space-y-6">
            {/* Pill Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full glass-panel border-primary/30 text-xs font-semibold text-primary-light">
              <Sparkles className="w-3.5 h-3.5 text-cyan" />
              <span>Le wallet souverain, pensé pour le Web3</span>
            </div>

            {/* Headline */}
            <h1 className="text-5xl sm:text-7xl lg:text-[5.5rem] font-extrabold tracking-[-0.06em] text-white leading-[0.95]">
              Votre crypto. Votre{' '}
              <span className="bg-gradient-to-r from-primary-light via-cyan to-emerald bg-clip-text text-transparent">
                liberté.
              </span>
            </h1>

            {/* Subheading */}
            <p className="max-w-xl text-base sm:text-lg text-slate-300 font-normal leading-relaxed">
              Un portefeuille multi-chaînes simple, rapide et non-custodial.
              Vos clés restent sur votre appareil, jamais chez nous.
            </p>

            {/* CTAs */}
            <div id="download" className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto pt-2">
              <a href="#download" className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-7 py-4 rounded-2xl bg-white text-slate-950 font-bold text-base shadow-xl shadow-black/20 hover:bg-slate-100 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200">
                <Download className="w-5 h-5" />
                <span>Télécharger Kalyx</span>
              </a>

              <a
                href="#security"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-4 rounded-2xl glass-panel text-slate-200 hover:text-white hover:bg-surface-hover font-semibold text-base transition-all duration-200"
              >
                <Shield className="w-5 h-5 text-primary-light" />
                <span>Pourquoi Kalyx ?</span>
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>

            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 pt-2">
              <a href="/kalyx-wallet.apk" download className="store-badge">
                <Smartphone className="w-6 h-6 text-cyan" />
                <span><small className="block text-[9px] uppercase tracking-wide text-slate-400">Télécharger</small><strong className="text-sm">l&apos;APK Android</strong></span>
              </a>
              <a href="https://t.me/kalyxntw" target="_blank" rel="noopener noreferrer" className="store-badge">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white text-black text-xs font-black">▶</span>
                <span><small className="block text-[9px] uppercase tracking-wide text-slate-400">Rejoindre</small><strong className="text-sm">la bêta Kalyx</strong></span>
              </a>
            </div>

            {/* Metrics stats row */}
            <div className="grid grid-cols-3 gap-2 pt-5 w-full max-w-lg">
              <div className="glass-panel rounded-2xl p-3">
                <div className="text-2xl sm:text-3xl font-extrabold text-white">100%</div>
                <div className="text-xs text-slate-400 font-medium mt-0.5">Non-Custodial</div>
              </div>
              <div className="glass-panel rounded-2xl p-3">
                <div className="text-2xl sm:text-3xl font-extrabold text-white">0</div>
                <div className="text-xs text-slate-400 font-medium mt-0.5">Données collectées</div>
              </div>
              <div className="glass-panel rounded-2xl p-3">
                <div className="text-2xl sm:text-3xl font-extrabold text-white">&lt; 1s</div>
                <div className="text-xs text-slate-400 font-medium mt-0.5">Swap instantané</div>
              </div>
            </div>
          </div>

          {/* Right Column: 3D Phone Mockup */}
          <div className="lg:col-span-5 flex justify-center lg:justify-end">
            <PhoneMockup />
          </div>
        </div>
      </div>
    </section>
  );
}
