import React from 'react';
import { Fingerprint, KeyRound, Layers3 } from 'lucide-react';

const features = [
  {
    icon: KeyRound,
    eyebrow: '01',
    title: 'Vos clés. Votre contrôle.',
    description: 'Une architecture non-custodial : vos clés privées sont chiffrées et restent sur votre appareil.',
    className: 'md:col-span-2',
  },
  {
    icon: Layers3,
    eyebrow: '02',
    title: 'Tout au même endroit.',
    description: 'Ethereum, Solana, Bitcoin et vos réseaux favoris dans une expérience fluide.',
    className: '',
  },
  {
    icon: Fingerprint,
    eyebrow: '03',
    title: 'Signez en confiance.',
    description: 'Les transactions sont analysées avant chaque validation pour vous protéger des drainers.',
    className: 'md:col-span-3',
  },
];

export function BentoGrid() {
  return (
    <section id="features" className="relative px-6 py-24 sm:px-8 lg:px-10 lg:py-32">
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 max-w-xl">
          <p className="mb-4 text-sm font-semibold text-cyan">Pensé pour durer</p>
          <h2 className="text-4xl font-bold tracking-[-0.04em] text-white sm:text-5xl">Simple par nature.</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {features.map(({ icon: Icon, eyebrow, title, description, className }) => (
            <article key={eyebrow} className={`${className} group relative min-h-[250px] overflow-hidden rounded-3xl bg-white/[0.03] p-7 ring-1 ring-white/[0.08] transition hover:bg-white/[0.055]`}>
              <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-primary/10 blur-3xl transition group-hover:bg-primary/20" />
              <div className="relative flex h-full flex-col justify-between">
                <div className="flex items-center justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[0.06] text-slate-200 ring-1 ring-white/[0.08]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="text-xs text-slate-600">{eyebrow}</span>
                </div>
                <div className="mt-12 max-w-xl">
                  <h3 className="text-2xl font-semibold tracking-tight text-white">{title}</h3>
                  <p className="mt-3 max-w-md text-sm leading-relaxed text-neutral-400">{description}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
