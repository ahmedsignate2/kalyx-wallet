import React from 'react';
import { KeyRound, Layers3, ScanSearch } from 'lucide-react';
import { Reveal } from './Reveal';

/* Chaque promesse correspond à une fonctionnalité livrée dans l'app (cf. docs/DESIGN.md §12). */
const cards = [
  {
    icon: KeyRound,
    title: 'Tes clés, tes règles.',
    text: 'Ta phrase de récupération ne quitte jamais ton téléphone. Pas de compte, pas de serveur Kalyx.',
  },
  {
    icon: Layers3,
    title: 'Toutes tes chaînes, un seul wallet.',
    text: 'Ethereum et ses L2, Solana, Bitcoin : un solde agrégé, un swap intégré, une seule app.',
  },
  {
    icon: ScanSearch,
    title: 'Tu sais ce que tu signes.',
    text: 'Chaque demande d’une dApp est traduite en une phrase : qui demande, ce qui va se passer, le niveau de risque.',
  },
];

export function BentoGrid() {
  return (
    <section id="features" data-halo="features" className="scroll-mt-16 px-5 py-20 sm:px-8 lg:py-28">
      <div className="mx-auto max-w-page">
        <Reveal className="mb-8 flex items-end justify-between">
          <h2 className="text-3xl font-semibold leading-none tracking-[-0.03em] text-lueur sm:text-5xl">
            Fait pour toi.
          </h2>
          <span className="hidden text-sm text-cendre sm:block md:hidden">Glisse pour explorer</span>
        </Reveal>
        <div className="-mx-5 flex snap-x gap-4 overflow-x-auto px-5 pb-5 sm:-mx-8 sm:px-8 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
          {cards.map(({ icon: Icon, title, text }, i) => (
            <Reveal key={title} delay={i * 0.08} className="flex min-w-[82vw] snap-start md:min-w-0">
              <article className="w-full rounded-container bg-nuit p-7 ring-1 ring-trait transition-colors duration-150 hover:bg-orbite">
                <div className="flex h-12 w-12 items-center justify-center rounded-input bg-orbite text-lueur">
                  <Icon className="h-6 w-6" strokeWidth={1.75} />
                </div>
                <h3 className="mt-16 text-2xl font-semibold leading-tight tracking-[-0.02em] text-lueur sm:text-3xl">
                  {title}
                </h3>
                <p className="mt-4 max-w-xs text-base leading-relaxed text-brume">{text}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
