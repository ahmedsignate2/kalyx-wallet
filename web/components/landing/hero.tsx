'use client';

import React, { useRef, useState } from 'react';
import { ArrowDown, Download } from 'lucide-react';
import { PhoneMock } from './phone-mock';

/* Chaque chip correspond à une fonctionnalité réellement implémentée (cf. security.tsx). */
const chips = ['Non-custodial', 'AES-256-GCM', 'Zéro télémétrie', 'Multi-chaînes'];

const MAX_TILT = 14; // degrés

export function Hero() {
  const stage = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const r = stage.current?.getBoundingClientRect();
    if (!r) return;
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    setTilt({ x: -py * MAX_TILT, y: px * MAX_TILT });
  }

  return (
    <section className="relative overflow-hidden px-5 pb-20 pt-32 sm:px-8 sm:pt-40 lg:pb-28">
      <div className="mx-auto grid max-w-page items-center gap-14 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10">
        <div>
          <p className="mb-8 flex items-center gap-3 text-xs uppercase tracking-[0.22em] text-sage">
            <span className="h-px w-8 bg-sage" />
            Acte I · Souveraineté
          </p>
          <h1 className="font-display text-[2.75rem] font-light leading-[1.02] tracking-[-0.02em] text-paper sm:text-6xl lg:text-7xl">
            La souveraineté
            <br />
            de vos actifs.
            <br />
            <em className="font-normal italic text-sage">Sans compromis.</em>
          </h1>
          <p className="mt-7 max-w-md text-lg font-light leading-relaxed text-mist">
            Gérez Bitcoin, Ethereum et Solana en toute liberté. Vos clés privées ne quittent jamais votre téléphone.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <a
              href="/kalyx-wallet.apk"
              download
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-paper px-6 text-sm font-medium text-ink transition-colors hover:bg-bone"
            >
              <Download className="h-4 w-4" />
              Télécharger l’APK
            </a>
            <a
              href="#securite"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-bone/20 px-6 text-sm font-medium text-paper transition-colors hover:border-bone/50"
            >
              Découvrir la sécurité
              <ArrowDown className="h-4 w-4" />
            </a>
          </div>

          <ul className="mt-9 flex flex-wrap gap-2" aria-label="Points clés">
            {chips.map((c) => (
              <li key={c} className="rounded-full border border-bone/10 bg-ink-2 px-3 py-1.5 text-xs text-bone/80">
                {c}
              </li>
            ))}
          </ul>
        </div>

        {/* Scène 3D : le téléphone bascule vers le pointeur. */}
        <div
          ref={stage}
          onMouseMove={onMouseMove}
          onMouseLeave={() => setTilt({ x: 0, y: 0 })}
          className="relative flex justify-center lg:justify-end"
          style={{ perspective: '1200px' }}
        >
          <div
            className="transition-transform duration-200 ease-editorial motion-reduce:transition-none"
            style={{ transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`, transformStyle: 'preserve-3d' }}
          >
            <PhoneMock />
          </div>
        </div>
      </div>
    </section>
  );
}
