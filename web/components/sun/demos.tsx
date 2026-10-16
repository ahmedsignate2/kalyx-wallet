'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { useReducedMotionSafe } from '../landing/reduced-motion';
import type { Dict } from '../../i18n';

/*
 * Les gestes de l'app, rejoués sur la page — pas des illustrations :
 *  - <HoldToSend>    maintenir 1,2 s pour envoyer (app/send.tsx).
 *  - <Lookalike>     le sosie comparé caractère par caractère (src/domain/validation/poisoning.ts).
 *  - <Decode>        le contrat en hexadécimal qui devient une phrase (src/domain/wc/explain.ts).
 *  - <PinLock>       les essais de PIN et l'attente qui grandit (src/security/pin.ts).
 *  - <Whitelist>     le délai de 24 h de la liste blanche (lib/whitelistStore).
 *  - <Duress>        deux codes, deux portefeuilles (app/duress.tsx).
 */

const useSeen = <T extends Element>(margin = '0px 0px -20% 0px') => {
  const ref = useRef<T>(null);
  const seen = useInView(ref, { once: true, margin: margin as `${number}px` });
  return [ref, seen] as const;
};

/* ------------------------------------------------------------------ */

/** L'anneau se remplit tant que le doigt est posé ; à 1,2 s, c'est parti. */
export function HoldToSend({ value, label }: { value: string; label: string }) {
  const reduce = useReducedMotionSafe();
  const [p, setP] = useState(0);
  const [done, setDone] = useState(false);
  const raf = useRef<number | null>(null);
  const t0 = useRef(0);

  const stop = () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    if (!done) setP(0);
  };
  const start = () => {
    if (done) return;
    t0.current = performance.now();
    const step = (now: number) => {
      const v = Math.min(1, (now - t0.current) / 1200);
      setP(v);
      if (v >= 1) {
        setDone(true);
        setTimeout(() => {
          setDone(false);
          setP(0);
        }, 1800);
        return;
      }
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  };
  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);

  const R = 46;
  const C = 2 * Math.PI * R;
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && !e.repeat && start()}
      onKeyUp={(e) => (e.key === ' ' || e.key === 'Enter') && stop()}
      className="group relative flex h-28 w-28 shrink-0 select-none items-center justify-center rounded-full bg-tint-send outline-none transition-transform active:scale-95 focus-visible:ring-2 focus-visible:ring-tint-sendInk"
      style={{ touchAction: 'none' }}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(196,85,42,0.18)" strokeWidth="4" />
        <circle cx="50" cy="50" r={R} fill="none" stroke="#C4552A" strokeWidth="4" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - (reduce && p > 0 ? 1 : p))} />
      </svg>
      <span className={`font-display text-2xl tabular-nums text-tint-sendInk transition-transform duration-300 ${done ? 'scale-0' : 'scale-100'}`}>{value}</span>
      <svg viewBox="0 0 24 24" className={`absolute h-10 w-10 text-tint-sendInk transition-transform duration-300 ${done ? 'scale-100' : 'scale-0'}`} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M5 12.5 10 17 19 7" />
      </svg>
    </button>
  );
}

/* ------------------------------------------------------------------ */

const FRIEND = '0x7a3Fc1D94e2B8f0a6C3e91b7D2a4F58c0E1d9c2E';
const LOOK = '0x7a3F08bA71e3D5c26F9a4B0e8C7d1A6f3E2b9c2E';

/** Les deux adresses s'alignent ; le début et la fin coïncident, le milieu se révèle différent, puis le mur tombe. */
export function Lookalike({ s }: { s: Dict['stolen']['s1'] }) {
  const reduce = useReducedMotionSafe();
  const [ref, seen] = useSeen<HTMLDivElement>();
  const [k, setK] = useState(0);
  useEffect(() => {
    if (!seen) return;
    if (reduce) return setK(FRIEND.length + 8);
    const id = setInterval(() => setK((v) => (v > FRIEND.length + 8 ? v : v + 1)), 45);
    return () => clearInterval(id);
  }, [seen, reduce]);
  const blocked = k > FRIEND.length;
  const row = (addr: string, other: string, danger: boolean) => (
    <code className="flex flex-wrap font-mono text-[13px] leading-6 sm:text-sm" dir="ltr">
      {addr.split('').map((c, i) => {
        const shown = i < k;
        const diff = c !== other[i];
        return (
          <span
            key={i}
            className={`transition-colors duration-300 ${!shown ? 'text-white/15' : diff ? (danger ? 'bg-[#FF6B5E]/20 text-[#FF8F85]' : 'text-white/45') : 'text-white'}`}
          >
            {c}
          </span>
        );
      })}
    </code>
  );
  return (
    <div ref={ref} className="relative space-y-4">
      <div>
        <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.14em] text-white/45">{s.friend}</p>
        {row(FRIEND, LOOK, false)}
      </div>
      <div className={blocked && !reduce ? 'shake-once' : ''}>
        <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.14em] text-[#FF8F85]">{s.lookalike}</p>
        {row(LOOK, FRIEND, true)}
      </div>
      <motion.p
        initial={false}
        animate={{ opacity: blocked ? 1 : 0, y: blocked ? 0 : 8 }}
        transition={{ duration: 0.4 }}
        className="text-lg font-semibold text-white"
      >
        {s.closing1} <span className="text-[#FF8F85]">{s.closingEm}</span>
        {s.closing2}
      </motion.p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** setApprovalForAll(opérateur, true) : le sélecteur réel, des paramètres d'exemple. */
const HEX = '0xa22cb4650000000000000000000000003f1c9e8b2a7d4f6e05c8b1a93d7e2f6c4b8a1d0e0000000000000000000000000000000000000000000000000000000000000001';
const GLYPHS = '0123456789abcdef';

/** L'hexadécimal se brouille, puis se recompose en phrase — ce que fait Kalyx avant chaque signature. */
export function Decode({ s }: { s: Dict['stolen']['s2'] }) {
  const reduce = useReducedMotionSafe();
  const [ref, seen] = useSeen<HTMLDivElement>();
  const target = s.approval;
  const [out, setOut] = useState(HEX.slice(0, 74));
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!seen) return;
    if (reduce) {
      setOut(target);
      setDone(true);
      return;
    }
    let f = 0;
    const total = 46;
    const id = setInterval(() => {
      f++;
      const r = f / total;
      const fixed = Math.floor(target.length * r);
      const noise = Array.from({ length: Math.max(0, Math.round((1 - r) * 74 * 0.6 + (target.length - fixed) * 0.4)) }, () => GLYPHS[(Math.random() * 16) | 0]).join('');
      setOut(target.slice(0, fixed) + noise);
      if (f >= total) {
        clearInterval(id);
        setOut(target);
        setDone(true);
      }
    }, 38);
    return () => clearInterval(id);
  }, [seen, reduce, target]);
  return (
    <div ref={ref}>
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/45">{s.unknownAsks}</p>
      <p className={`mt-3 min-h-[4.5rem] break-all text-lg leading-snug ${done ? 'font-semibold text-white' : 'font-mono text-sm text-white/60'}`}>{out}</p>
      <motion.p initial={false} animate={{ opacity: done ? 1 : 0 }} className="mt-4 inline-flex rounded-full bg-[#FF6B5E]/15 px-3 py-1 text-xs font-medium text-[#FF8F85]">
        {s.danger}
      </motion.p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** Onze essais se jouent : six gratuits, puis l'attente grandit jusqu'à une heure. */
export function PinLock({ s }: { s: Dict['stolen']['s3'] }) {
  const reduce = useReducedMotionSafe();
  const [ref, seen] = useSeen<HTMLDivElement>();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!seen) return;
    if (reduce) return setN(11);
    const id = setInterval(() => setN((v) => (v >= 11 ? v : v + 1)), 260);
    return () => clearInterval(id);
  }, [seen, reduce]);
  // tries : « 1 à 6 », « 7 », … « 11+ » ; on retrouve la ligne de l'essai n.
  const row = n <= 0 ? -1 : n <= 6 ? 0 : Math.min(n - 6, s.tries.length - 1);
  return (
    <div ref={ref}>
      <div className="flex flex-wrap gap-2" aria-hidden>
        {Array.from({ length: 11 }, (_, i) => (
          <span
            key={i}
            className={`flex h-9 w-9 items-center justify-center rounded-full font-mono text-xs transition-all duration-300 ${
              i < n ? (i < 6 ? 'bg-white/15 text-white' : 'bg-[#FF6B5E]/20 text-[#FF8F85]') : 'bg-white/[0.04] text-white/25'
            }`}
          >
            {i + 1}
          </span>
        ))}
      </div>
      <dl className="mt-6 divide-y divide-white/10 border-y border-white/10 text-sm">
        {s.tries.map((tries, i) => (
          <div key={tries} className={`flex items-center justify-between py-2.5 transition-colors duration-300 ${i === row ? 'text-white' : 'text-white/40'}`}>
            <dt>{i === 0 || i === s.tries.length - 1 ? s.attempts : s.attempt} {tries}</dt>
            <dd className="font-mono">{s.waits[i]}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** Les deux premières lignes s'égrènent sur 24 h ; la troisième reste fermée. */
export function Whitelist({ s }: { s: Dict['stolen']['s4'] }) {
  const reduce = useReducedMotionSafe();
  const [ref, seen] = useSeen<HTMLUListElement>();
  return (
    <ul ref={ref} className="space-y-4">
      {s.rows.map(([label, value], i) => {
        const locked = i === s.rows.length - 1;
        return (
          <li key={label}>
            <div className="flex items-baseline justify-between gap-4 text-sm">
              <span className="text-white/60">{label}</span>
              <span className={`font-mono ${locked ? 'text-[#FF8F85]' : 'text-white'}`}>{value}</span>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
              <motion.div
                className={`h-full rounded-full ${locked ? 'bg-[#FF6B5E]' : 'bg-[#E6C682]'}`}
                initial={{ width: locked ? '100%' : '0%' }}
                animate={{ width: locked || seen ? '100%' : '0%' }}
                transition={{ duration: reduce ? 0 : 6 + i * 2, ease: 'linear' }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */

/** Deux codes : l'un ouvre vos portefeuilles, l'autre un leurre — et rien ne trahit la différence. */
export function Duress({ s }: { s: Dict['stolen']['s5'] }) {
  const [which, setWhich] = useState(0);
  const reduce = useReducedMotionSafe();
  const [ref, seen] = useSeen<HTMLDivElement>();
  useEffect(() => {
    if (!seen || reduce) return;
    const id = setInterval(() => setWhich((w) => 1 - w), 2600);
    return () => clearInterval(id);
  }, [seen, reduce]);
  return (
    <div ref={ref}>
      <div role="tablist" className="inline-flex rounded-full bg-white/[0.06] p-1">
        {s.rows.map(([label], i) => (
          <button
            key={label}
            role="tab"
            aria-selected={which === i}
            onClick={() => setWhich(i)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${which === i ? 'bg-[#F6EEE2] text-[#0B0B10]' : 'text-white/60 hover:text-white'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {/* Le même écran, au pixel près : seul le libellé du dessous change. */}
      <div className="mt-5 rounded-2xl bg-white/[0.05] p-4 ring-1 ring-white/10">
        <div className="flex items-center justify-between">
          <span className="h-2 w-20 rounded-full bg-white/25" />
          <span className="font-mono text-white/70">•••• €</span>
        </div>
        <div className="mt-4 space-y-2.5">
          {[0, 1, 2].map((r) => (
            <div key={r} className="flex items-center gap-3">
              <span className="h-7 w-7 rounded-full bg-white/10" />
              <span className="h-2 flex-1 rounded-full bg-white/10" />
              <span className="font-mono text-xs text-white/50">••••</span>
            </div>
          ))}
        </div>
      </div>
      <motion.p key={which} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-3 font-mono text-xs text-white/60">
        → {s.rows[which][1]}
      </motion.p>
    </div>
  );
}
