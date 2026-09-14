import React from 'react';
import { ArrowRight, Download } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { Hero } from '../components/Hero';
import { BentoGrid } from '../components/BentoGrid';
import { Footer } from '../components/Footer';

export default function HomePage() {
  return (
    <div className="min-h-screen overflow-hidden bg-background text-slate-100 selection:bg-primary/30 selection:text-white">
      <Navbar />
      <main>
        <Hero />
        <BentoGrid />
        <section id="download" className="px-6 py-24 sm:px-8 lg:px-10">
          <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-8 rounded-[2rem] bg-[#241142] p-8 sm:p-12 md:flex-row md:items-center">
            <div>
              <p className="mb-3 text-sm font-bold uppercase tracking-widest text-violet-200">Kalyx Wallet</p>
              <h2 className="max-w-xl text-4xl font-black uppercase leading-none tracking-tight text-white sm:text-5xl">Commencer</h2>
            </div>
            <a href="/kalyx-wallet.apk" download className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-6 py-4 text-sm font-bold uppercase text-slate-950 transition hover:bg-lime-100">
              <Download className="h-4 w-4" />
              Télécharger l&apos;APK
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
