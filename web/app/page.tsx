import React from 'react';
import { Navbar } from '../components/Navbar';
import { Hero } from '../components/Hero';
import { BentoGrid } from '../components/BentoGrid';
import { SecuritySection } from '../components/SecuritySection';
import { Footer } from '../components/Footer';
import { Download, Sparkles, Smartphone, ShieldCheck, ArrowRight } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-slate-100 selection:bg-primary/30 selection:text-white">
      <Navbar />

      <main className="flex-1">
        <Hero />
        <BentoGrid />
        <SecuritySection />

        {/* Download Section */}
        <section id="download" className="py-24 relative overflow-hidden bg-background">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div className="rounded-3xl glass-panel p-8 sm:p-14 border-primary/40 relative overflow-hidden text-center">
              {/* Background gradient lights */}
              <div className="absolute -top-24 -left-24 w-72 h-72 bg-primary/20 rounded-full blur-[100px] pointer-events-none" />
              <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-cyan/20 rounded-full blur-[100px] pointer-events-none" />

              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full glass-panel border-cyan/30 text-xs font-semibold text-cyan mb-6">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Disponible pour Android & iOS</span>
              </div>

              <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight mb-4 max-w-2xl mx-auto leading-tight">
                Téléchargez Kalyx Wallet dès aujourd&apos;hui.
              </h2>

              <p className="text-slate-300 text-base sm:text-lg max-w-xl mx-auto mb-10 leading-relaxed">
                Rejoignez des milliers d&apos;utilisateurs qui ont choisi l&apos;autonomie financière sans sacrifier l&apos;expérience utilisateur.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 max-w-md mx-auto">
                <a
                  href="/kalyx-wallet.apk"
                  download
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-4 rounded-2xl bg-gradient-to-r from-primary to-cyan text-white font-bold text-base shadow-xl shadow-primary/30 hover:shadow-primary/50 hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  <Download className="w-5 h-5" />
                  <span>Télécharger l&apos;APK Android</span>
                </a>

                <a
                  href="https://t.me/kalyxntw"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-4 rounded-2xl glass-panel text-slate-200 hover:text-white hover:bg-surface-hover font-semibold text-base transition-all"
                >
                  <span>Rejoindre le Beta Test</span>
                  <ArrowRight className="w-4 h-4" />
                </a>
              </div>

              <div className="mt-8 pt-8 border-t border-border/80 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Signature APK vérifiée</span>
                </div>
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-primary-light" />
                  <span>Android 8.0+ & iOS 14+</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
