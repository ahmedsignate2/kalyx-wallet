import React from 'react';
import { Fingerprint, KeyRound, Layers3 } from 'lucide-react';

const cards = [
  { icon: KeyRound, title: 'Vos clés, vos règles.', text: 'Une souveraineté totale, directement sur votre appareil.', color: 'bg-[#7C3AED]' },
  { icon: Layers3, title: 'Échangez n’importe quoi.', text: 'Ethereum, Solana et Bitcoin réunis dans un seul wallet.', color: 'bg-[#F59E8B]' },
  { icon: Fingerprint, title: 'Sécurité maximale.', text: 'Chaque transaction est analysée avant que vous ne signiez.', color: 'bg-[#B8E986]' },
];

export function BentoGrid() {
  return (
    <section id="features" className="overflow-hidden bg-[#0B2B26] px-5 py-20 sm:px-8 lg:py-28">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-end justify-between px-1">
          <h2 className="text-3xl font-black uppercase leading-none tracking-[-0.04em] text-white sm:text-5xl">Fait pour vous.</h2>
          <span className="hidden text-xs font-medium uppercase tracking-widest text-emerald-100/50 sm:block">Glissez pour explorer</span>
        </div>
        <div className="flex snap-x gap-4 overflow-x-auto pb-5 md:grid md:grid-cols-3 md:overflow-visible">
          {cards.map(({ icon: Icon, title, text, color }) => (
            <article key={title} className={`min-w-[82vw] snap-start rounded-3xl ${color} p-7 text-[#10231F] md:min-w-0`}>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-black/10">
                <Icon className="h-6 w-6" />
              </div>
              <h3 className="mt-20 text-3xl font-black uppercase leading-[0.95] tracking-[-0.04em]">{title}</h3>
              <p className="mt-4 max-w-xs text-sm font-medium leading-relaxed text-black/65">{text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
