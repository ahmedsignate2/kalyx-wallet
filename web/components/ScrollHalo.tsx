'use client';

import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from 'framer-motion';
import { Halo } from './Halo';

/**
 * LE halo du site : une seule lumière, fixée à l'écran, qui vit à travers la page
 * (bible §3 : une seule animation ambiante). Il naît derrière le téléphone du Hero,
 * s'éloigne et s'estompe derrière les cartes, puis se rallume derrière le geste
 * final (télécharger). Tout est piloté par le défilement — le halo ne bouge jamais
 * « sans raison » — et lissé par un ressort aux valeurs du ressort Doux (26/120).
 *
 * Chaque étape est une ancre `data-halo="<nom>"` posée dans une section ; on mesure
 * sa position dans le document et on interpole entre les étapes. « Réduire les
 * animations » : le halo reste immobile derrière le Hero.
 */
type Step = {
  name: string;
  x: number;
  y: number;
  scale: number;
  opacity: number;
};

/**
 * Position à l'écran (fraction du viewport) quand l'ancre est au centre de l'écran.
 * Exception « hero » : au scroll 0, centré sur le haut du téléphone (là où vit le
 * solde), quelle que soit la hauteur du titre.
 */
const STEPS: Step[] = [
  { name: 'hero', x: 0.5, y: 0.34, scale: 1, opacity: 1 },
  { name: 'features', x: 0.88, y: 0.3, scale: 0.7, opacity: 0.35 },
  { name: 'security', x: 0.1, y: 0.42, scale: 0.8, opacity: 0.3 },
  { name: 'download', x: 0.78, y: 0.5, scale: 0.95, opacity: 0.9 },
  { name: 'end', x: 0.78, y: 0.5, scale: 0.95, opacity: 0 },
];

const SIZE = 640;
const GENTLE = { stiffness: 120, damping: 26, mass: 1 };

type Measure = { keys: number[]; xs: number[]; ys: number[] };

function measure(): Measure {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const xs = STEPS.map((s) => s.x * vw);
  const ys = STEPS.map((s) => s.y * vh);
  const keys = STEPS.map((step, i) => {
    if (step.name === 'end') return document.documentElement.scrollHeight - vh;
    const el = document.querySelector<HTMLElement>(`[data-halo="${step.name}"]`);
    if (!el) return Number.NaN;
    const r = el.getBoundingClientRect();
    if (i === 0) {
      ys[0] = r.top + window.scrollY + Math.min(220, r.height * 0.3);
      return 0;
    }
    return r.top + window.scrollY + r.height / 2 - vh / 2;
  });
  // Un scroll strictement croissant, même si une ancre manque.
  const clean: number[] = [];
  let last = -1;
  for (const k of keys) {
    const v = Number.isNaN(k) ? last + 1 : Math.max(k, last + 1);
    clean.push(v);
    last = v;
  }
  return { keys: clean, xs, ys };
}

export function ScrollHalo() {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const [m, setM] = useState<Measure>({
    keys: STEPS.map((_, i) => i * 800),
    xs: STEPS.map((s) => s.x * 400),
    ys: STEPS.map((s) => s.y * 800),
  });

  useEffect(() => {
    const update = () => setM(measure());
    update();
    // Re-mesure quand la page change de hauteur (image, polices, menu mobile).
    const ro = new ResizeObserver(update);
    ro.observe(document.body);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  const xRaw = useTransform(scrollY, m.keys, m.xs);
  const yRaw = useTransform(scrollY, m.keys, m.ys);
  const scaleRaw = useTransform(
    scrollY,
    m.keys,
    STEPS.map((s) => s.scale),
  );
  const opacityRaw = useTransform(
    scrollY,
    m.keys,
    STEPS.map((s) => s.opacity),
  );

  const x = useSpring(xRaw, GENTLE);
  const y = useSpring(yRaw, GENTLE);
  const scale = useSpring(scaleRaw, GENTLE);
  const opacity = useSpring(opacityRaw, GENTLE);

  if (reduce) {
    return (
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        <Halo size={SIZE} mood="up" className="absolute left-1/2 top-[34vh] -translate-x-1/2 -translate-y-1/2" />
      </div>
    );
  }

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <motion.div
        style={{
          x,
          y,
          scale,
          opacity,
          width: SIZE,
          height: SIZE,
          marginLeft: -SIZE / 2,
          marginTop: -SIZE / 2,
        }}
        className="absolute left-0 top-0 will-change-transform"
      >
        <Halo size={SIZE} mood="up" breathe />
      </motion.div>
    </div>
  );
}
