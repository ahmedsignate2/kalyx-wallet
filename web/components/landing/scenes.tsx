'use client';

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowUp, Check, ShieldAlert, X } from 'lucide-react';
import { EASE } from './motion';

/**
 * Scènes animées du chapitre « Ne jamais se faire voler » : des écrans de l'app
 * rejoués en boucle, en DOM, avec les tempos réels (ui/tokens.ts : maintien 1,2 s,
 * éclat 700 ms / 40 particules ; src/security/pin.ts : 30 s d'attente au 7e essai ;
 * ui/SignSheet.tsx : Danger = Refuser par défaut + maintenir 2 s).
 * Couleurs = thème sombre de l'app (ui/tokens.ts).
 */
const APP = {
  bg: '#06070D',
  surface: '#0E1019',
  surface2: '#161926',
  text: '#F2F4FA',
  muted: '#9499AB',
  faint: '#5D6275',
  primary: '#F4F6FF',
  up: '#3CD98A',
  danger: '#FF4D5E',
} as const;

/* ------------------------------------------------------------------ */
/* Boucle de phases                                                     */
/* ------------------------------------------------------------------ */

type Phase<T extends string> = { name: T; ms: number };

function usePhases<T extends string>(phases: Phase<T>[], running: boolean): T {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => setI((n) => (n + 1) % phases.length), phases[i].ms);
    return () => clearTimeout(t);
  }, [i, running, phases]);
  return phases[i].name;
}

/* ------------------------------------------------------------------ */
/* Cadre de téléphone avec écran DOM                                    */
/* ------------------------------------------------------------------ */

export function PhoneScreen({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative w-60 select-none sm:w-64 ${className}`}>
      <div className="relative aspect-[9/19.2] rounded-[2.4rem] border border-bone/15 bg-ink-3 p-[6px] shadow-phone">
        <div className="absolute left-1/2 top-3 z-20 h-[20px] w-[76px] -translate-x-1/2 rounded-full bg-ink" />
        <div className="relative h-full w-full overflow-hidden rounded-[2rem]" style={{ background: APP.bg, color: APP.text }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Doigt : un disque translucide qui se pose et appuie. */
function Finger({ pressing, className = '' }: { pressing: boolean; className?: string }) {
  return (
    <motion.div
      aria-hidden
      className={`pointer-events-none absolute z-30 h-9 w-9 rounded-full border border-white/40 bg-white/25 backdrop-blur-[2px] ${className}`}
      initial={{ opacity: 0, scale: 1.4 }}
      animate={{ opacity: 1, scale: pressing ? 0.85 : 1 }}
      exit={{ opacity: 0, scale: 1.4 }}
      transition={{ duration: 0.25, ease: EASE }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Scène 1 — Face ID, puis le PIN qui ralentit                          */
/* ------------------------------------------------------------------ */

type UnlockPhase = 'faceid' | 'ok' | 'home' | 'pin' | 'shake' | 'wait';
const UNLOCK: Phase<UnlockPhase>[] = [
  { name: 'faceid', ms: 1700 },
  { name: 'ok', ms: 900 },
  { name: 'home', ms: 2200 },
  { name: 'pin', ms: 1400 },
  { name: 'shake', ms: 700 },
  { name: 'wait', ms: 2400 },
];

function FaceIdGlyph({ done }: { done: boolean }) {
  const stroke = done ? APP.up : APP.text;
  return (
    <svg viewBox="0 0 100 100" className="h-20 w-20">
      {/* Coins */}
      {[
        'M12 34 V22 a10 10 0 0 1 10 -10 H34',
        'M66 12 H78 a10 10 0 0 1 10 10 V34',
        'M88 66 V78 a10 10 0 0 1 -10 10 H66',
        'M34 88 H22 a10 10 0 0 1 -10 -10 V66',
      ].map((d, i) => (
        <motion.path key={i} d={d} fill="none" stroke={stroke} strokeWidth={4} strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5, delay: i * 0.08, ease: EASE }} />
      ))}
      <AnimatePresence mode="wait">
        {done ? (
          <motion.path key="check" d="M32 52 L45 65 L70 38" fill="none" stroke={APP.up} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4, ease: EASE }} />
        ) : (
          <motion.g key="face" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} stroke={stroke} strokeWidth={4} strokeLinecap="round" fill="none">
            <path d="M36 42 v6" />
            <path d="M64 42 v6" />
            <path d="M50 42 v14 a4 4 0 0 1 -4 4" />
            <path d="M36 66 q14 10 28 0" />
          </motion.g>
        )}
      </AnimatePresence>
    </svg>
  );
}

export function UnlockScene() {
  const reduce = useReducedMotion();
  const phase = usePhases(UNLOCK, !reduce);
  const dots = phase === 'pin' ? 4 : phase === 'shake' ? 4 : 0;

  return (
    <PhoneScreen>
      <AnimatePresence mode="wait">
        {(phase === 'faceid' || phase === 'ok') && (
          <motion.div key="lock" className="flex h-full flex-col items-center justify-center gap-6 px-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
            <div className="relative">
              <FaceIdGlyph done={phase === 'ok'} />
              {phase === 'faceid' && (
                <motion.div aria-hidden className="absolute inset-x-2 h-px" style={{ background: APP.text, opacity: 0.7 }} initial={{ top: '15%' }} animate={{ top: ['15%', '85%', '15%'] }} transition={{ duration: 1.4, ease: 'easeInOut', repeat: Infinity }} />
              )}
            </div>
            <p className="text-sm" style={{ color: phase === 'ok' ? APP.up : APP.muted }}>
              {phase === 'ok' ? 'Déverrouillé' : 'Regardez l’écran'}
            </p>
          </motion.div>
        )}

        {phase === 'home' && (
          <motion.div key="home" className="flex h-full flex-col px-5 pt-12" initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4, ease: EASE }}>
            <p className="text-[10px]" style={{ color: APP.muted }}>Compte principal</p>
            <div className="mt-3 flex items-baseline gap-1 overflow-hidden">
              {['1', ' ', '2', '4', '8', ',', '3', '0'].map((c, i) => (
                <motion.span key={i} className="text-3xl font-semibold tabular-nums" initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5, delay: 0.1 + i * 0.05, ease: EASE }}>
                  {c}
                </motion.span>
              ))}
              <span className="text-lg" style={{ color: APP.muted }}>€</span>
            </div>
            <p className="mt-1 text-[11px]" style={{ color: APP.up }}>↑ +12,40 € · aujourd’hui</p>
            <div className="mt-6 grid grid-cols-3 gap-2">
              {['Recevoir', 'Envoyer', 'Swap'].map((l, i) => (
                <div key={l} className="rounded-xl py-2.5 text-center text-[10px]" style={{ background: i === 1 ? APP.primary : APP.surface, color: i === 1 ? APP.bg : APP.text }}>
                  {l}
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-2">
              {[
                ['BTC', '0,0142 BTC', '812,10 €'],
                ['ETH', '0,21 ETH', '402,20 €'],
                ['SOL', '2,4 SOL', '34,00 €'],
              ].map(([s, a, v]) => (
                <div key={s} className="flex items-center justify-between rounded-xl px-3 py-2.5 text-[11px]" style={{ background: APP.surface }}>
                  <span>
                    {s} <span style={{ color: APP.faint }}>· {a}</span>
                  </span>
                  <span className="tabular-nums">{v}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {(phase === 'pin' || phase === 'shake' || phase === 'wait') && (
          <motion.div key="pin" className="flex h-full flex-col items-center justify-center px-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
            <p className="text-xs" style={{ color: APP.muted }}>Code PIN</p>
            <motion.div className="mt-4 flex gap-3" animate={phase === 'shake' ? { x: [0, -8, 8, -6, 6, 0] } : { x: 0 }} transition={{ duration: 0.45 }}>
              {[0, 1, 2, 3].map((i) => (
                <motion.span key={i} className="block h-3 w-3 rounded-full border" style={{ borderColor: phase === 'shake' || phase === 'wait' ? APP.danger : APP.text }} animate={{ background: i < dots ? (phase === 'shake' ? APP.danger : APP.text) : 'transparent' }} transition={{ delay: phase === 'pin' ? 0.25 + i * 0.22 : 0 }} />
              ))}
            </motion.div>
            <AnimatePresence mode="wait">
              {phase === 'wait' ? (
                <motion.p key="wait" className="mt-5 text-center text-xs" style={{ color: APP.danger }} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  7ᵉ essai raté.
                  <br />
                  Réessayez dans <Countdown from={30} />
                </motion.p>
              ) : (
                <motion.p key="hint" className="mt-5 text-xs" style={{ color: APP.faint }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  {phase === 'shake' ? 'Code incorrect' : 'Saisie…'}
                </motion.p>
              )}
            </AnimatePresence>
            <div className="mt-6 grid grid-cols-3 gap-2 opacity-70">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <span key={n} className="flex h-9 w-9 items-center justify-center rounded-full text-sm" style={{ background: APP.surface }}>
                  {n}
                </span>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </PhoneScreen>
  );
}

function Countdown({ from }: { from: number }) {
  const [n, setN] = useState(from);
  useEffect(() => {
    const t = setInterval(() => setN((v) => (v > 1 ? v - 1 : v)), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className="tabular-nums">{n} s</span>;
}

/* ------------------------------------------------------------------ */
/* Scène 2 — Maintenir pour envoyer, puis l'éclat                       */
/* ------------------------------------------------------------------ */

type SendPhase = 'recap' | 'holding' | 'burst' | 'sent';
const SEND: Phase<SendPhase>[] = [
  { name: 'recap', ms: 1300 },
  { name: 'holding', ms: 1200 }, // durations.holdToSend
  { name: 'burst', ms: 700 }, // durations.burst
  { name: 'sent', ms: 1800 },
];

const PARTICLES = Array.from({ length: 40 }, (_, i) => {
  const a = (i / 40) * Math.PI * 2 + (i % 3) * 0.2;
  const r = 46 + (i * 37) % 34;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r, s: 2 + (i % 3) };
});

export function HoldToSendScene() {
  const reduce = useReducedMotion();
  const phase = usePhases(SEND, !reduce);
  const holding = phase === 'holding';

  return (
    <PhoneScreen>
      <div className="flex h-full flex-col px-5 pt-12">
        <p className="text-[10px]" style={{ color: APP.muted }}>Envoyer · Récapitulatif</p>
        <div className="mt-4 space-y-2 text-[11px]">
          {[
            ['À', 'vitalik.eth'],
            ['Montant', '50 USDC · 46,20 €'],
            ['Frais réseau', '0,04 €'],
            ['Votre solde passera de', '812,10 € à 765,86 €'],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ background: APP.surface }}>
              <span style={{ color: APP.muted }}>{k}</span>
              <span className="tabular-nums">{v}</span>
            </div>
          ))}
        </div>

        <div className="relative mt-auto mb-8">
          {/* Éclat : 40 particules, 700 ms */}
          <AnimatePresence>
            {phase === 'burst' && (
              <div className="pointer-events-none absolute left-1/2 top-1/2 z-20" aria-hidden>
                {PARTICLES.map((p, i) => (
                  <motion.span key={i} className="absolute rounded-full" style={{ width: p.s, height: p.s, background: i % 4 === 0 ? '#FFD9B8' : '#CFE3FF' }} initial={{ x: 0, y: 0, opacity: 1 }} animate={{ x: p.x, y: p.y, opacity: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.7, ease: EASE }} />
                ))}
              </div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {phase === 'sent' ? (
              <motion.div key="sent" className="flex h-12 items-center justify-center gap-2 rounded-2xl text-sm font-medium" style={{ background: APP.surface, color: APP.up }} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: EASE }}>
                <Check className="h-4 w-4" /> Envoyé
              </motion.div>
            ) : (
              <motion.div key="hold" className="relative flex h-12 items-center justify-center gap-2 overflow-hidden rounded-2xl text-sm font-medium" style={{ background: APP.primary, color: APP.bg }} animate={{ scale: holding ? 0.96 : 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                {/* Jauge de maintien : 1,2 s */}
                <motion.span aria-hidden className="absolute inset-y-0 left-0" style={{ background: 'rgba(6,7,13,0.18)' }} initial={{ width: '0%' }} animate={{ width: holding || phase === 'burst' ? '100%' : '0%' }} transition={{ duration: holding ? 1.2 : 0.2, ease: 'linear' }} />
                <ArrowUp className="relative h-4 w-4" />
                <span className="relative">{holding ? 'Maintenez…' : 'Maintenir pour envoyer'}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>{(holding || phase === 'burst') && <Finger pressing className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />}</AnimatePresence>
        </div>
      </div>
    </PhoneScreen>
  );
}

/* ------------------------------------------------------------------ */
/* Scène 3 — La feuille de signature                                    */
/* ------------------------------------------------------------------ */

type SignPhase = 'browsing' | 'sheet' | 'danger' | 'refused';
const SIGN: Phase<SignPhase>[] = [
  { name: 'browsing', ms: 1000 },
  { name: 'sheet', ms: 3000 },
  { name: 'danger', ms: 3200 },
  { name: 'refused', ms: 1200 },
];

export function SignScene() {
  const reduce = useReducedMotion();
  const phase = usePhases(SIGN, !reduce);
  const open = phase === 'sheet' || phase === 'danger';
  const danger = phase === 'danger';

  return (
    <PhoneScreen>
      {/* Page de la dApp, en fond */}
      <div className="flex h-full flex-col px-5 pt-12">
        <div className="flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px]" style={{ background: APP.surface, color: APP.muted }}>
          <span className="h-2 w-2 rounded-full" style={{ background: danger ? APP.danger : APP.up }} />
          {danger ? 'free-mint-nft.xyz' : 'app.uniswap.org'}
        </div>
        <div className="mt-6 space-y-3 opacity-40">
          <div className="h-16 rounded-2xl" style={{ background: APP.surface }} />
          <div className="h-16 rounded-2xl" style={{ background: APP.surface }} />
          <div className="h-10 w-2/3 rounded-xl" style={{ background: APP.surface2 }} />
        </div>
      </div>

      {/* Voile + feuille */}
      <AnimatePresence>
        {open && (
          <motion.div key="veil" className="absolute inset-0 z-10" style={{ background: 'rgba(6,7,13,0.55)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} />
        )}
        {open && (
          <motion.div key="sheet" className="absolute inset-x-0 bottom-0 z-20 rounded-t-[1.6rem] px-4 pb-5 pt-3" style={{ background: APP.surface2 }} initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ duration: 0.55, ease: EASE }}>
            <div className="mx-auto mb-3 h-1 w-8 rounded-full" style={{ background: APP.faint }} />
            <AnimatePresence mode="wait">
              {!danger ? (
                <motion.div key="safe" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                  <p className="text-[10px]" style={{ color: APP.muted }}>app.uniswap.org demande une signature</p>
                  <p className="mt-1 text-sm font-medium">Échanger 50 USDC contre de l’ETH</p>
                  <div className="mt-3 space-y-1.5 text-[11px]">
                    {[
                      ['Vous perdez', '50 USDC', APP.text],
                      ['Vous recevez', '≈ 0,021 ETH', APP.up],
                    ].map(([k, v, c], i) => (
                      <motion.div key={k} className="flex justify-between rounded-xl px-3 py-2" style={{ background: APP.surface }} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 + i * 0.25, ease: EASE }}>
                        <span style={{ color: APP.muted }}>{k}</span>
                        <span className="tabular-nums" style={{ color: c }}>{v}</span>
                      </motion.div>
                    ))}
                  </div>
                  <motion.p className="mt-3 inline-block rounded-full px-2.5 py-1 text-[10px]" style={{ background: 'rgba(60,217,138,0.15)', color: APP.up }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}>
                    Risque faible · domaine vérifié
                  </motion.p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                    <span className="rounded-xl py-2.5 text-center" style={{ background: APP.surface }}>Refuser</span>
                    <span className="rounded-xl py-2.5 text-center font-medium" style={{ background: APP.primary, color: APP.bg }}>Signer</span>
                  </div>
                </motion.div>
              ) : (
                <motion.div key="danger" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                  <motion.div className="flex items-center gap-2 rounded-xl px-3 py-2 text-[11px]" style={{ background: 'rgba(255,77,94,0.15)', color: APP.danger }} animate={{ x: [0, -4, 4, -2, 0] }} transition={{ duration: 0.4 }}>
                    <ShieldAlert className="h-3.5 w-3.5" /> Ce site n’est pas celui qu’il prétend être
                  </motion.div>
                  <p className="mt-3 text-sm font-medium">Autoriser ce contrat à déplacer tous vos NFT, sans limite.</p>
                  <p className="mt-1 text-[10px]" style={{ color: APP.muted }}>setApprovalForAll · GoPlus : contrat signalé</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                    <span className="rounded-xl py-2.5 text-center font-medium" style={{ background: APP.primary, color: APP.bg }}>Refuser</span>
                    <span className="relative overflow-hidden rounded-xl py-2.5 text-center" style={{ background: APP.surface, color: APP.muted }}>
                      <motion.span aria-hidden className="absolute inset-y-0 left-0" style={{ background: 'rgba(255,77,94,0.25)' }} initial={{ width: '0%' }} animate={{ width: '100%' }} transition={{ duration: 2, ease: 'linear', delay: 0.6 }} />
                      <span className="relative">Maintenir 2 s</span>
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
        {phase === 'refused' && (
          <motion.div key="refused" className="absolute inset-x-0 bottom-8 z-20 mx-auto flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-[11px]" style={{ background: APP.surface2 }} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <X className="h-3.5 w-3.5" style={{ color: APP.danger }} /> Refusé. Rien n’est parti.
          </motion.div>
        )}
      </AnimatePresence>
    </PhoneScreen>
  );
}

/* ------------------------------------------------------------------ */
/* Scène 4 — L'adresse-sosie                                            */
/* ------------------------------------------------------------------ */

const FRIEND = '0x7a3Fc1D94e2B8f0a6C3e91b7D2a4F58c0E1d9c2E';
const LOOKALIKE = '0x7a3F08bA71e3D5c26F9a4B0e8C7d1A6f3E2b9c2E';

type PoisonPhase = 'typing' | 'checking' | 'blocked';
const POISON: Phase<PoisonPhase>[] = [
  { name: 'typing', ms: 1900 },
  { name: 'checking', ms: 500 },
  { name: 'blocked', ms: 2800 },
];

export function PoisonScene() {
  const reduce = useReducedMotion();
  const phase = usePhases(POISON, !reduce);
  const [typed, setTyped] = useState(reduce ? LOOKALIKE.length : 0);

  useEffect(() => {
    if (reduce) return;
    if (phase !== 'typing') return;
    setTyped(0);
    const t = setInterval(() => setTyped((n) => (n < LOOKALIKE.length ? n + 1 : n)), 1800 / LOOKALIKE.length);
    return () => clearInterval(t);
  }, [phase, reduce]);

  const blocked = phase === 'blocked';
  const shown = LOOKALIKE.slice(0, typed);

  return (
    <PhoneScreen>
      <div className="flex h-full flex-col px-5 pt-12">
        <p className="text-[10px]" style={{ color: APP.muted }}>Envoyer · Destinataire</p>
        <div className="mt-3 rounded-xl px-3 py-3 font-mono text-[10px] leading-relaxed" style={{ background: APP.surface, borderColor: blocked ? APP.danger : 'transparent', borderWidth: 1 }}>
          <span className="break-all">
            {blocked ? (
              <>
                {LOOKALIKE.slice(0, 6)}
                <span style={{ background: 'rgba(255,77,94,0.25)', color: '#FFB4B4' }}>{LOOKALIKE.slice(6, -4)}</span>
                {LOOKALIKE.slice(-4)}
              </>
            ) : (
              shown
            )}
          </span>
          {phase === 'typing' && <span className="animate-pulse">▍</span>}
        </div>

        <AnimatePresence mode="wait">
          {phase === 'checking' && (
            <motion.p key="chk" className="mt-3 text-[11px]" style={{ color: APP.muted }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              Comparaison avec vos adresses connues…
            </motion.p>
          )}
          {blocked && (
            <motion.div key="blk" className="mt-3 rounded-xl p-3 text-[11px]" style={{ background: 'rgba(255,77,94,0.12)', border: `1px solid ${APP.danger}` }} initial={{ opacity: 0, y: 8, x: 0 }} animate={{ opacity: 1, y: 0, x: [0, -6, 6, -3, 0] }} exit={{ opacity: 0 }} transition={{ duration: 0.5, ease: EASE }}>
              <p className="flex items-center gap-1.5 font-medium" style={{ color: APP.danger }}>
                <ShieldAlert className="h-3.5 w-3.5" /> Adresse suspecte — envoi bloqué
              </p>
              <p className="mt-1.5" style={{ color: APP.muted }}>
                Même début et même fin que <span style={{ color: APP.text }}>vitalik.eth</span> ({FRIEND.slice(0, 6)}…{FRIEND.slice(-4)}), mais le milieu diffère.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-auto mb-8">
          <div className="flex h-12 items-center justify-center rounded-2xl text-sm font-medium" style={{ background: blocked ? APP.surface : APP.primary, color: blocked ? APP.faint : APP.bg }}>
            Continuer
          </div>
        </div>
      </div>
    </PhoneScreen>
  );
}
