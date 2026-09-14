import React from 'react';

/** Marque Kalyx : l'anneau étoilé de l'app (`ui/KalyxLogo.tsx`), en monochrome `currentColor`. */
export function Mark({ size = 24, className = '' }: { size?: number; className?: string }) {
  const segments = Array.from({ length: 16 }).map((_, i) => {
    const angle = (360 / 16) * i;
    const rad = (angle * Math.PI) / 180;
    const outer = 38 + 6 * Math.cos(rad); // plus longs en haut : énergie dirigée vers le haut
    const inner = 20;
    const width = 5.5;
    return (
      <rect
        key={i}
        x={-width / 2}
        y={-outer}
        width={width}
        height={outer - inner}
        rx={width / 2}
        transform={`rotate(${angle} 0 0)`}
      />
    );
  });
  return (
    <svg width={size} height={size} viewBox="-50 -50 100 100" fill="currentColor" aria-hidden className={className}>
      {segments}
      <circle cx={0} cy={0} r={8} />
    </svg>
  );
}
