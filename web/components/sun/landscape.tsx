import React from 'react';

/**
 * Le paysage de l'app (ui/Landscape.tsx), en SVG statique pour le web : ciel en
 * dégradé, astre et halo, quatre plans de dunes (somme de gaussiennes, courbe
 * Catmull-Rom), brume entre les plans. Même géométrie, mêmes palettes.
 */
type Peak = readonly [cx: number, amp: number, sigma: number];
type Hill = { base: number; peaks: readonly Peak[]; lit: string; shadow: string };
export type Phase = 'dawn' | 'day' | 'dusk' | 'night';

const W = 1440;
const H = 900;

function crest(hill: Hill, n = 48): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    let lift = 0;
    for (const [cx, amp, s] of hill.peaks) lift += amp * Math.exp(-((u - cx) ** 2) / (2 * s * s));
    pts.push([u * W, (hill.base - lift) * H]);
  }
  return pts;
}

function smooth(pts: [number, number][]): string {
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    d += ` C ${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

const SHAPES = {
  far: { base: 0.76, peaks: [[0.84, 0.3, 0.13], [0.6, 0.15, 0.1], [0.18, 0.08, 0.12]] as const },
  back: { base: 0.84, peaks: [[0.1, 0.2, 0.12], [0.33, 0.13, 0.1], [0.56, 0.07, 0.1]] as const },
  mid: { base: 0.9, peaks: [[0.72, 0.16, 0.12], [0.98, 0.2, 0.1], [0.42, 0.05, 0.12]] as const },
  near: { base: 1.0, peaks: [[0.18, 0.09, 0.2], [0.62, 0.07, 0.22], [1.02, 0.12, 0.12]] as const },
};
const hills = (c: readonly [string, string][]): Hill[] => [
  { ...SHAPES.far, lit: c[0][0], shadow: c[0][1] },
  { ...SHAPES.back, lit: c[1][0], shadow: c[1][1] },
  { ...SHAPES.mid, lit: c[2][0], shadow: c[2][1] },
  { ...SHAPES.near, lit: c[3][0], shadow: c[3][1] },
];

const SCENES: Record<Phase, { sky: readonly [string, string, string]; sun: string; glow: string; haze: string; hills: Hill[] }> = {
  dawn: { sky: ['#232448', '#8A5D86', '#F7B192'], sun: '#FFE6CC', glow: '#FFC2A0', haze: '#F4B3A0', hills: hills([['#F7AFA2', '#8F5280'], ['#7A5C95', '#2C2853'], ['#FFB49A', '#B25C82'], ['#FFDCCB', '#E9A0A0']]) },
  day: { sky: ['#264878', '#6E95C0', '#F2D1A8'], sun: '#FFF6E2', glow: '#FFE2B0', haze: '#F6D7B8', hills: hills([['#EDB48E', '#8E6A8E'], ['#7E82AC', '#3B4170'], ['#F3BB8C', '#A8687A'], ['#FBE3CA', '#E5B29A']]) },
  dusk: { sky: ['#121532', '#38305F', '#E8896B'], sun: '#FFE1B8', glow: '#FFB27A', haze: '#F2A07A', hills: hills([['#FFAE6E', '#9A4374'], ['#7E5A98', '#221F45'], ['#FF9F5E', '#A2436E'], ['#FFD2B2', '#E08C7E']]) },
  night: { sky: ['#06070F', '#151836', '#2E2A55'], sun: '#EDE8FF', glow: '#B9B2FF', haze: '#5B4E8C', hills: hills([['#5A4C8C', '#1C1838'], ['#2E2850', '#0F0E22'], ['#62508F', '#1D1A3A'], ['#3E3770', '#15132A']]) },
};

const STARS = Array.from({ length: 34 }, (_, i) => ({ x: (((i * 137) % 101) / 101) * 100, y: (((i * 61) % 47) / 47) * 42, r: i % 5 === 0 ? 1.6 : 1, o: 0.3 + ((i * 17) % 10) / 22 }));

/**
 * Remplit son parent (position: relative requis). `sunAt` : hauteur de l'astre
 * (fraction), `sunX` : sa position horizontale, `veil` : assombrit le bas.
 */
export function Landscape({ phase = 'dusk', sunAt = 0.42, sunX = 0.74, veil = false, id }: { phase?: Phase; sunAt?: number; sunX?: number; veil?: boolean; id: string }) {
  const sc = SCENES[phase];
  const stars = phase !== 'day';
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, ${sc.sky[0]} 0%, ${sc.sky[1]} 50%, ${sc.sky[2]} 80%)` }} />
      {stars && (
        <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
          {STARS.map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={s.r * 0.12} fill="#fff" opacity={s.o * 0.6} />
          ))}
        </svg>
      )}
      {/* L'astre et son halo, qui respire (animation CSS, coupée par prefers-reduced-motion). */}
      <div
        className="sun-breathe absolute aspect-square w-[110vmax] max-w-[1600px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ left: `${sunX * 100}%`, top: `${sunAt * 100}%`, background: `radial-gradient(circle, ${sc.glow}BF 0%, ${sc.glow}4D 30%, ${sc.glow}00 68%)` }}
      />
      <div
        className="absolute aspect-square w-[9vmin] min-w-[56px] max-w-[110px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ left: `${sunX * 100}%`, top: `${sunAt * 100}%`, background: sc.sun, boxShadow: `0 0 60px 10px ${sc.glow}80` }}
      />
      <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <defs>
          {sc.hills.map((h, i) => (
            <linearGradient key={i} id={`${id}-h${i}`} x1="0.9" y1="0" x2="0.1" y2="1">
              <stop offset="0" stopColor={h.lit} />
              <stop offset="1" stopColor={h.shadow} />
            </linearGradient>
          ))}
          <linearGradient id={`${id}-haze`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={sc.haze} stopOpacity="0" />
            <stop offset="0.5" stopColor={sc.haze} stopOpacity="1" />
            <stop offset="1" stopColor={sc.haze} stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`${id}-veil`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0.42" stopColor="#0B0A18" stopOpacity="0" />
            <stop offset="1" stopColor="#0B0A18" stopOpacity="0.5" />
          </linearGradient>
        </defs>
        {sc.hills.map((h, i) => {
          const line = smooth(crest(h));
          return (
            <g key={i}>
              {i === 1 && <rect x="0" y={H * 0.5} width={W} height={H * 0.36} fill={`url(#${id}-haze)`} opacity="0.32" />}
              {i === 2 && <rect x="0" y={H * 0.62} width={W} height={H * 0.3} fill={`url(#${id}-haze)`} opacity="0.22" />}
              <path d={`${line} L ${W} ${H} L 0 ${H} Z`} fill={`url(#${id}-h${i})`} />
              <path d={line} fill="none" stroke="#fff" strokeOpacity={[0.45, 0.22, 0.4, 0.5][i] * 0.45} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
            </g>
          );
        })}
        {veil && <rect x="0" y="0" width={W} height={H} fill={`url(#${id}-veil)`} />}
      </svg>
    </div>
  );
}
