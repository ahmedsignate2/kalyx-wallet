'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useScroll, useSpring, useTransform, type MotionValue } from 'framer-motion';
import { useReducedMotionSafe } from '../landing/reduced-motion';

/**
 * Le paysage de l'app (ui/Landscape.tsx), porté sur le web : ciel en dégradé,
 * astre et halo qui respire, étoiles qui scintillent, quatre plans de dunes
 * (somme de gaussiennes, courbe Catmull-Rom) et brume entre les plans.
 *
 * `parallax` : chaque plan glisse à sa vitesse au défilement — les mêmes vitesses
 * que l'app (ciel 0,12 → premier plan 0,52). `pointer` : les plans suivent
 * légèrement la souris. `phase="auto"` : l'heure du visiteur, comme l'app
 * (skyPhaseAt de ui/tokens.ts).
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

/** Même découpage que l'app : aube 5-9 h, jour 9-17 h, crépuscule 17-21 h, nuit sinon. */
export const phaseAt = (hour: number): Phase => (hour >= 5 && hour < 9 ? 'dawn' : hour >= 9 && hour < 17 ? 'day' : hour >= 17 && hour < 21 ? 'dusk' : 'night');

const STARS = Array.from({ length: 40 }, (_, i) => ({ x: (((i * 137) % 101) / 101) * 100, y: (((i * 61) % 47) / 47) * 44, r: i % 5 === 0 ? 2.2 : 1.3, o: 0.35 + ((i * 17) % 10) / 20, d: ((i * 7) % 11) * 0.45 }));

/** Vitesses de l'app : ciel, astre, puis les quatre plans du lointain au proche. */
const SPEEDS = { sky: 0.12, sun: 0.2, hills: [0.28, 0.36, 0.44, 0.52] };
const POINTER = [6, 12, 20, 30];

function Layer({ y, x, children }: { y?: MotionValue<string>; x?: MotionValue<number>; children: React.ReactNode }) {
  return (
    <motion.div className="absolute inset-0 will-change-transform" style={{ y, x }}>
      {children}
    </motion.div>
  );
}

export function Landscape({
  phase = 'dusk',
  sunAt = 0.42,
  sunX = 0.74,
  veil = false,
  parallax = false,
  pointer = false,
  rise = false,
  sunAtMobile,
  sunXMobile,
  id,
}: {
  phase?: Phase | 'auto';
  sunAt?: number;
  sunX?: number;
  veil?: boolean;
  /** 'top' : la scène est en haut de page (défile vers le haut) ; 'through' : elle traverse l'écran. */
  parallax?: false | 'top' | 'through';
  pointer?: boolean;
  /** L'astre se lève quand la scène entre à l'écran. */
  rise?: boolean;
  /** Position de l'astre sur téléphone (le texte y occupe toute la largeur). */
  sunAtMobile?: number;
  sunXMobile?: number;
  id: string;
}) {
  const reduce = useReducedMotionSafe();
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (sunAtMobile === undefined && sunXMobile === undefined) return;
    const mq = window.matchMedia('(max-width: 639px)');
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [sunAtMobile, sunXMobile]);
  if (narrow) {
    sunAt = sunAtMobile ?? sunAt;
    sunX = sunXMobile ?? sunX;
  }
  const [auto, setAuto] = useState<Phase>('dusk');
  useEffect(() => {
    if (phase !== 'auto') return;
    const tick = () => setAuto(phaseAt(new Date().getHours()));
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, [phase]);
  const resolved: Phase = phase === 'auto' ? auto : phase;
  const sc = SCENES[resolved];
  const stars = resolved !== 'day';

  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: parallax === 'through' ? ['start end', 'end start'] : ['start start', 'end start'] });
  const on = !!parallax && !reduce;
  // Décalage en % de la hauteur de la scène, proportionnel à la vitesse du plan.
  const amp = parallax === 'through' ? 30 : 45;
  const center = parallax === 'through' ? 0.5 : 0;
  // Le lointain compense davantage le défilement : il semble bouger moins vite que le proche.
  const shift = (speed: number) => (v: number) => (on ? `${((v - center) * (0.6 - speed) * amp).toFixed(2)}%` : '0%');
  const skyY = useTransform(scrollYProgress, shift(SPEEDS.sky));
  const sunY = useTransform(scrollYProgress, shift(SPEEDS.sun));
  const h0 = useTransform(scrollYProgress, shift(SPEEDS.hills[0]));
  const h1 = useTransform(scrollYProgress, shift(SPEEDS.hills[1]));
  const h2 = useTransform(scrollYProgress, shift(SPEEDS.hills[2]));
  const h3 = useTransform(scrollYProgress, shift(SPEEDS.hills[3]));
  const hillY = [h0, h1, h2, h3];

  // L'astre qui se lève : de l'horizon à sa place quand la scène traverse l'écran.
  const riseTop = useTransform(scrollYProgress, [0.05, 0.5], [`${(sunAt + 0.32) * 100}%`, `${sunAt * 100}%`]);

  // La souris : un léger glissement horizontal, plus fort au premier plan.
  const px = useMotionValue(0);
  const spx = useSpring(px, { stiffness: 60, damping: 20 });
  const p0 = useTransform(spx, (v) => v * POINTER[0]);
  const p1 = useTransform(spx, (v) => v * POINTER[1]);
  const p2 = useTransform(spx, (v) => v * POINTER[2]);
  const p3 = useTransform(spx, (v) => v * POINTER[3]);
  const pX = [p0, p1, p2, p3];
  useEffect(() => {
    if (!pointer || reduce) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;
    const move = (e: PointerEvent) => px.set(-(e.clientX / window.innerWidth - 0.5));
    window.addEventListener('pointermove', move, { passive: true });
    return () => window.removeEventListener('pointermove', move);
  }, [pointer, reduce, px]);

  return (
    <div ref={ref} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Ciel (un peu plus haut que la scène : la parallaxe ne découvre jamais le fond). */}
      <Layer y={skyY}>
        <div className="absolute -inset-y-[20%] inset-x-0 transition-[background] duration-1000" style={{ background: `linear-gradient(180deg, ${sc.sky[0]} 0%, ${sc.sky[0]} 16%, ${sc.sky[1]} 52%, ${sc.sky[2]} 78%)` }} />
        {stars &&
          STARS.map((s, i) => (
            <span
              key={i}
              className="twinkle absolute rounded-full bg-white"
              style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.r, height: s.r, opacity: resolved === 'night' ? s.o : s.o * 0.55, ['--o' as string]: resolved === 'night' ? s.o : s.o * 0.55, animationDelay: `${s.d}s` } as React.CSSProperties}
            />
          ))}
      </Layer>

      {/* L'astre et son halo, qui respire. */}
      <Layer y={sunY}>
        <motion.div className="absolute inset-x-0" style={{ top: rise && !reduce ? riseTop : `${sunAt * 100}%`, height: 0 }}>
          <div
            className="sun-breathe absolute aspect-square w-[110vmax] max-w-[1600px] rounded-full"
            style={{ left: `${sunX * 100}%`, top: 0, background: `radial-gradient(circle, ${sc.glow}BF 0%, ${sc.glow}4D 30%, ${sc.glow}00 68%)` }}
          />
          <div
            className="absolute aspect-square w-[9vmin] min-w-[56px] max-w-[110px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ left: `${sunX * 100}%`, top: 0, background: sc.sun, boxShadow: `0 0 60px 10px ${sc.glow}80` }}
          />
        </motion.div>
      </Layer>

      {sc.hills.map((h, i) => {
        const line = smooth(crest(h));
        return (
          <Layer key={i} y={hillY[i]} x={pX[i]}>
            {/* Plus large que la scène : le glissement à la souris ne découvre pas les bords. */}
            <svg className="absolute -inset-x-[3%] top-0 h-[115%] w-[106%]" viewBox={`0 0 ${W} ${H * 1.15}`} preserveAspectRatio="none">
              <defs>
                <linearGradient id={`${id}-h${i}`} x1="0.9" y1="0" x2="0.1" y2="1">
                  <stop offset="0" stopColor={h.lit} />
                  <stop offset="1" stopColor={h.shadow} />
                </linearGradient>
                <linearGradient id={`${id}-z${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor={sc.haze} stopOpacity="0" />
                  <stop offset="0.5" stopColor={sc.haze} stopOpacity="1" />
                  <stop offset="1" stopColor={sc.haze} stopOpacity="0" />
                </linearGradient>
              </defs>
              {i === 0 && <rect x="0" y={H * 0.5} width={W} height={H * 0.36} fill={`url(#${id}-z0)`} opacity="0.32" />}
              {i === 2 && <rect x="0" y={H * 0.62} width={W} height={H * 0.3} fill={`url(#${id}-z2)`} opacity="0.22" />}
              <path d={`${line} L ${W} ${H * 1.15} L 0 ${H * 1.15} Z`} fill={`url(#${id}-h${i})`} />
              <path d={line} fill="none" stroke="#fff" strokeOpacity={[0.45, 0.22, 0.4, 0.5][i] * 0.45} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
            </svg>
          </Layer>
        );
      })}

      {veil && <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(11,10,24,0) 42%, rgba(11,10,24,0.5) 100%)' }} />}
    </div>
  );
}
