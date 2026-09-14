import React from 'react';

/**
 * Halo — le seul dégradé autorisé du site (bible §2), transposé de `ui/kit/Halo.tsx`.
 * Radial : blanc au centre → glacier → frange chaude à 30 % → transparent.
 * `mood` : hausse = plus lumineux, frange chaude ; baisse = plus faible, froid.
 *
 * Deux usages :
 *  - <Halo size /> : disque autonome (derrière un titre, un CTA).
 *  - <HaloBackdrop /> : couche pleine largeur posée derrière une section ; le
 *    dégradé fond dans l'Encre avant les bords → aucune coupure visible.
 * Les deux sont `pointer-events: none` et purement décoratifs (aria-hidden).
 */
type Mood = 'up' | 'down' | 'flat';

const STOPS = {
  centre: '#FFFFFF',
  glacier: '#CFE3FF',
  chaud: 'rgba(255,217,184,0.30)',
  froid: 'rgba(207,227,255,0.25)',
} as const;

function useStops(mood: Mood) {
  const intensity = mood === 'up' ? 1 : mood === 'down' ? 0.55 : 0.8;
  const warm = mood === 'down' ? STOPS.froid : STOPS.chaud;
  return { intensity, warm };
}

export function Halo({
  size = 320,
  mood = 'flat',
  className = '',
  breathe = false,
}: {
  size?: number;
  mood?: Mood;
  className?: string;
  breathe?: boolean;
}) {
  const { intensity, warm } = useStops(mood);
  const id = React.useId();
  return (
    <div
      aria-hidden
      className={`pointer-events-none ${breathe ? 'animate-breathe' : ''} ${className}`}
      style={{ width: size, height: size, opacity: intensity }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <radialGradient id={id} cx="50%" cy="50%" r="50%">
            <stop offset={0} stopColor={STOPS.centre} stopOpacity={0.9} />
            <stop offset={0.35} stopColor={STOPS.glacier} stopOpacity={0.55} />
            <stop offset={0.7} stopColor={warm} stopOpacity={0.3} />
            <stop offset={0.92} stopColor={STOPS.glacier} stopOpacity={0} />
            <stop offset={1} stopColor={STOPS.glacier} stopOpacity={0} />
          </radialGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
      </svg>
    </div>
  );
}

/**
 * Couche pleine largeur. `cx`/`cy` en % de la zone : où le halo est centré.
 * Par défaut en haut à droite, comme derrière le solde de l'accueil.
 */
export function HaloBackdrop({
  mood = 'flat',
  cx = 82,
  cy = 28,
  radius = 45,
  className = '',
}: {
  mood?: Mood;
  cx?: number;
  cy?: number;
  radius?: number;
  className?: string;
}) {
  const { intensity, warm } = useStops(mood);
  const id = React.useId();
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 ${className}`} style={{ opacity: intensity }}>
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <radialGradient id={id} cx={`${cx}%`} cy={`${cy}%`} r={`${radius}%`} gradientUnits="objectBoundingBox">
            <stop offset={0} stopColor={STOPS.centre} stopOpacity={0.85} />
            <stop offset={0.3} stopColor={STOPS.glacier} stopOpacity={0.5} />
            <stop offset={0.65} stopColor={warm} stopOpacity={0.25} />
            <stop offset={0.92} stopColor={STOPS.glacier} stopOpacity={0} />
            <stop offset={1} stopColor={STOPS.glacier} stopOpacity={0} />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="100" height="100" fill={`url(#${id})`} />
      </svg>
    </div>
  );
}
