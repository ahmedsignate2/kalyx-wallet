import Image from 'next/image';
import React from 'react';

/** Tranches de la coque, de l'avant vers l'arrière (px) : ~9 px d'épaisseur visibles quand le téléphone bascule. */
const EDGE_LAYERS = [1.5, 3, 4.5, 6, 7.5, 9];

/**
 * Smartphone 9/19.2 avec l'écran d'accueil de l'app, rendu depuis son code (`public/app-screenshot.jpg`).
 * `depth` : la coque prend une épaisseur 3D (à placer dans un parent en `preserve-3d`).
 */
export function PhoneMock({ className = '', alt, depth = false }: { className?: string; alt: string; depth?: boolean }) {
  return (
    <div className={`relative w-72 select-none sm:w-80 ${className}`} style={depth ? { transformStyle: 'preserve-3d' } : undefined}>
      {depth &&
        EDGE_LAYERS.map((z, i) => (
          <div
            key={z}
            aria-hidden
            className="absolute inset-0 rounded-[2.6rem] border border-bone/10"
            style={{
              transform: `translateZ(-${z}px)`,
              backgroundColor: i === EDGE_LAYERS.length - 1 ? '#0c0f0e' : '#1d2320',
            }}
          />
        ))}
      <div
        className="relative aspect-[9/19.2] rounded-[2.6rem] border border-bone/15 bg-ink-3 p-[6px] shadow-phone"
        style={depth ? { transform: 'translateZ(0.5px)' } : undefined}
      >
        {/* Découpe caméra */}
        <div className="absolute left-1/2 top-3 z-20 h-[22px] w-[88px] -translate-x-1/2 rounded-full bg-ink" />
        <div className="relative h-full w-full overflow-hidden rounded-[2.2rem] bg-ink-2">
          <Image
            src="/app-screenshot.jpg"
            alt={alt}
            fill
            priority
            sizes="(max-width: 640px) 288px, 320px"
            className="h-full w-full object-cover object-top"
          />
        </div>
      </div>
    </div>
  );
}
