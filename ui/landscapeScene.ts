/**
 * LE PAYSAGE, sans dessin : la géométrie des collines et les palettes des
 * heures. Pur (aucun import de React Native) : l'app (ui/Landscape.tsx) et
 * l'extension de navigateur (extension/ui/landscape.ts) dessinent le MÊME ciel
 * à partir d'ici.
 */
import type { SkyPhase } from '../lib/skyClock';

/* ------------------------------------------------------------------ */
/* Géométrie : collines lisses                                        */
/* ------------------------------------------------------------------ */

/** Un sommet : position (fraction de largeur), hauteur et largeur (fractions de hauteur / largeur). */
export type Peak = readonly [cx: number, amp: number, sigma: number];
/** Une colline : sa ligne de base, ses sommets, sa lumière (côté astre) et son ombre. */
export type Hill = { base: number; peaks: readonly Peak[]; lit: string; shadow: string };

/** Points de la crête : somme de gaussiennes au-dessus de la ligne de base. */
export function crest(w: number, h: number, hill: Hill, n = 48): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    let lift = 0;
    for (const [cx, amp, s] of hill.peaks) lift += amp * Math.exp(-((u - cx) ** 2) / (2 * s * s));
    pts.push([u * w, (hill.base - lift) * h]);
  }
  return pts;
}

/** Courbe lisse (Catmull-Rom → Bézier cubique) passant par les points. */
export function smooth(pts: [number, number][]): string {
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

/** La colline remplie (crête puis bas de l'écran) et sa crête seule (liseré). */
export function hillPaths(w: number, h: number, hill: Hill) {
  const line = smooth(crest(w, h, hill));
  return { fill: `${line} L ${w} ${h} L 0 ${h} Z`, rim: line };
}

/** Quelques étoiles fixes (nuit, aube) : positions dérivées de l'indice. */
export function stars(w: number, h: number) {
  return Array.from({ length: 30 }, (_, i) => ({ x: ((i * 137) % 101) / 101 * w, y: ((i * 61) % 47) / 47 * h * 0.45, r: i % 5 === 0 ? 1.4 : 0.8, o: 0.35 + ((i * 17) % 10) / 20 }));
}

/* ------------------------------------------------------------------ */
/* Palettes des heures                                                 */
/* ------------------------------------------------------------------ */

export type Scene = { sky: readonly [string, string, string]; sun: string; glow: string; haze: string; stars: boolean; hills: readonly [Hill, Hill, Hill, Hill] };

/*
 * Quatre plans, du lointain au proche. Les sommets hauts sont À DROITE (là où
 * se lève l'astre) : à gauche, où se pose le texte, les collines restent basses
 * et sombres — le texte clair y garde son contraste.
 */
export const SHAPES = {
  far: { base: 0.76, peaks: [[0.84, 0.3, 0.13], [0.6, 0.15, 0.1], [0.18, 0.08, 0.12]] as const },
  back: { base: 0.84, peaks: [[0.1, 0.2, 0.12], [0.33, 0.13, 0.1], [0.56, 0.07, 0.1]] as const },
  mid: { base: 0.9, peaks: [[0.72, 0.16, 0.12], [0.98, 0.2, 0.1], [0.42, 0.05, 0.12]] as const },
  near: { base: 1.0, peaks: [[0.18, 0.09, 0.2], [0.62, 0.07, 0.22], [1.02, 0.12, 0.12]] as const },
};
export const hills = (c: readonly [string, string][]): Scene['hills'] => [
  { ...SHAPES.far, lit: c[0][0], shadow: c[0][1] },
  { ...SHAPES.back, lit: c[1][0], shadow: c[1][1] },
  { ...SHAPES.mid, lit: c[2][0], shadow: c[2][1] },
  { ...SHAPES.near, lit: c[3][0], shadow: c[3][1] },
];

export const SCENES: Record<SkyPhase, Scene> = {
  dawn: { sky: ['#232448', '#8A5D86', '#F7B192'], sun: '#FFE6CC', glow: '#FFC2A0', haze: '#F4B3A0', stars: true, hills: hills([['#F7AFA2', '#8F5280'], ['#7A5C95', '#2C2853'], ['#FFB49A', '#B25C82'], ['#FFDCCB', '#E9A0A0']]) },
  day: { sky: ['#264878', '#6E95C0', '#F2D1A8'], sun: '#FFF6E2', glow: '#FFE2B0', haze: '#F6D7B8', stars: false, hills: hills([['#EDB48E', '#8E6A8E'], ['#7E82AC', '#3B4170'], ['#F3BB8C', '#A8687A'], ['#FBE3CA', '#E5B29A']]) },
  dusk: { sky: ['#121532', '#38305F', '#E8896B'], sun: '#FFE1B8', glow: '#FFB27A', haze: '#F2A07A', stars: true, hills: hills([['#FFAE6E', '#9A4374'], ['#7E5A98', '#221F45'], ['#FF9F5E', '#A2436E'], ['#FFD2B2', '#E08C7E']]) },
  night: { sky: ['#06070F', '#151836', '#2E2A55'], sun: '#EDE8FF', glow: '#B9B2FF', haze: '#5B4E8C', stars: true, hills: hills([['#5A4C8C', '#1C1838'], ['#2E2850', '#0F0E22'], ['#62508F', '#1D1A3A'], ['#3E3770', '#15132A']]) },
};

/**
 * CRÈME : aquarelle pastel (pêche, rose, lavande) posée sur le papier — le
 * texte sombre reste lisible par-dessus. NUIT : le crépuscule de l'accueil
 * (encre bleue, pêche, mauve) — le texte crème aussi.
 */
export const SCENE_DUNES = {
  light: { wash: '#FBE1D0', haze: '#FFFFFF', hills: hills([['#FFD5BE', '#F2AABD'], ['#ECE0FC', '#C4ACEF'], ['#FFCBAE', '#F2A39E'], ['#FFE6D8', '#F7C3B6']]) },
  dark: { wash: '#211B3C', haze: '#F2A07A', hills: SCENES.dusk.hills },
} as const;
