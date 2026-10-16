'use client';

import React, { useState } from 'react';
import type { Dict } from '../../i18n';

/** Mots d'exemple (liste BIP-39), jamais une vraie phrase. */
const WORDS = ['ocean', 'planet', 'silent', 'orbit', 'north', 'garden', 'river', 'pulse', 'velvet', 'cradle', 'mirror', 'fossil'];

/** La carte de sauvegarde de l'app : voilée tant que le doigt n'est pas posé. */
export function SeedCard({ t }: { t: Dict }) {
  const [held, setHeld] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={held}
      aria-label={t.lose.holdAria}
      onPointerDown={() => setHeld(true)}
      onPointerUp={() => setHeld(false)}
      onPointerLeave={() => setHeld(false)}
      onPointerCancel={() => setHeld(false)}
      onKeyDown={(e) => e.key === ' ' && setHeld(true)}
      onKeyUp={(e) => e.key === ' ' && setHeld(false)}
      className="select-none rounded-[2rem] bg-ink-2 p-6 shadow-card ring-1 ring-cream-line sm:p-8"
      style={{ touchAction: 'none' }}
    >
      <p className="mb-5 flex items-center justify-between text-sm font-semibold text-paper">
        {t.lose.cardLabel}
        <span className="rounded-full bg-tint-earn px-2.5 py-1 text-xs font-medium text-tint-earnInk">{t.lose.cardExample}</span>
      </p>
      <ol className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
        {WORDS.map((w, i) => (
          <li key={w} className="flex items-baseline gap-2 rounded-xl bg-ink-3 px-3 py-2.5">
            <span className="w-5 text-xs text-mist">{i + 1}</span>
            <span
              className="text-base font-medium text-paper transition-[filter,opacity] duration-300"
              style={{ filter: held ? 'blur(0px)' : 'blur(6px)', opacity: held ? 1 : 0.6, transitionDelay: held ? `${i * 25}ms` : '0ms' }}
            >
              {w}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-5 text-center text-sm text-mist">{held ? t.lose.release : t.lose.hold}</p>
    </div>
  );
}
