import Image from 'next/image';
import React from 'react';

/** Smartphone 9/19.2 avec la vraie capture de l'app (`public/app-screenshot.jpg`). */
export function PhoneMock({ className = '', alt }: { className?: string; alt: string }) {
  return (
    <div className={`relative w-72 select-none sm:w-80 ${className}`}>
      <div className="relative aspect-[9/19.2] rounded-[2.6rem] border border-bone/15 bg-ink-3 p-[6px] shadow-phone">
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
