import Image from 'next/image';
import React from 'react';

/**
 * Mockup du téléphone. Seule ombre du site (`shadow-mockup`, teintée Encre + halo) :
 * mise en scène d'un objet physique, pas un élément d'interface.
 */
export function PhoneMockup() {
  return (
    <div className="relative mx-auto w-[286px] select-none sm:w-[340px] lg:w-[380px]">
      <div className="relative rotate-[3deg] rounded-[2.5rem] bg-nuit p-2 shadow-mockup ring-1 ring-trait transition-transform duration-500 ease-doux hover:rotate-0">
        <div className="absolute left-1/2 top-3 z-20 h-6 w-24 -translate-x-1/2 rounded-full bg-encre" />
        <div className="relative aspect-[923/2048] overflow-hidden rounded-[2.1rem] bg-orbite">
          <Image
            src="/app-screenshot.jpg"
            alt="Accueil de Kalyx Wallet : solde agrégé, courbe de valeur et tokens Bitcoin, Ethereum et Solana"
            fill
            priority
            sizes="(max-width: 640px) 286px, (max-width: 1024px) 340px, 380px"
            className="object-cover object-top"
          />
        </div>
      </div>
    </div>
  );
}
