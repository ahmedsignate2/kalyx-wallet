'use client';

import React from 'react';
import { Download, Shield, Zap, Sparkles, CheckCircle2 } from 'lucide-react';
import { PhoneMockup } from './PhoneMockup';

export function Hero() {
  return (
    <section className="relative pt-32 pb-20 lg:pt-40 lg:pb-32 overflow-hidden bg-hero-gradient">
      {/* Background Decorative Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f293715_1px,transparent_1px),linear-gradient(to_bottom,#1f293715_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          {/* Left Column: Copy & CTAs */}
          <div className="lg:col-span-7 flex flex-col items-center lg:items-start text-center lg:text-left space-y-6">
            {/* Pill Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full glass-panel border-primary/30 text-xs font-semibold text-primary-light shadow-md shadow-primary/10">
              <Sparkles className="w-3.5 h-3.5 text-cyan" />
              <span>Kalyx Wallet 2.0 • Non-Custodial & Multi-Chain</span>
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white leading-[1.1]">
              Le portefeuille Web3 qui respecte votre{' '}
              <span className="bg-gradient-to-r from-primary-light via-cyan to-emerald bg-clip-text text-transparent">
                liberté.
              </span>
            </h1>

            {/* Subheading */}
            <p className="max-w-2xl text-base sm:text-lg text-slate-300 font-normal leading-relaxed">
              Prenez le contrôle absolu de vos crypto-actifs sur Ethereum, Solana, Bitcoin et Layer 2s.
              Vos clés privées ne quittent jamais votre téléphone. Zéro intermédiaire, zéro serveur central.
            </p>

            {/* CTAs */}
            <div id="download" className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto pt-2">
              <a
                href="#download"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-7 py-4 rounded-2xl bg-gradient-to-r from-primary to-cyan text-white font-bold text-base shadow-xl shadow-primary/30 hover:shadow-primary/50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
              >
                <Download className="w-5 h-5" />
                <span>Télécharger l&apos;application</span>
              </a>

              <a
                href="#security"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-4 rounded-2xl glass-panel text-slate-200 hover:text-white hover:bg-surface-hover font-semibold text-base transition-all duration-200"
              >
                <Shield className="w-5 h-5 text-primary-light" />
                <span>Découvrir la sécurité</span>
              </a>
            </div>

            {/* Store & Safety Guarantees */}
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-y-2 gap-x-6 pt-4 text-xs text-slate-400">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Android APK disponible</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Chiffrement AES-256 matériel</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Conforme LCEN & RGPD</span>
              </div>
            </div>

            {/* Metrics stats row */}
            <div className="grid grid-cols-3 gap-6 pt-6 border-t border-border/80 w-full max-w-lg">
              <div>
                <div className="text-2xl sm:text-3xl font-extrabold text-white">100%</div>
                <div className="text-xs text-slate-400 font-medium mt-0.5">Non-Custodial</div>
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-extrabold text-white">0</div>
                <div className="text-xs text-slate-400 font-medium mt-0.5">Données collectées</div>
              </div>
              <div>
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
