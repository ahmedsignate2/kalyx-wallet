import React from 'react';
import { ChapterHead } from './chapter';
import { Item, Reveal, Stagger } from './motion';
import type { Dict } from '../../i18n';

/*
 * Vérifié dans le code :
 *  - src/domain/validation/poisoning.ts : même début + même fin, milieu différent → bloquant (app/send.tsx).
 *  - src/domain/tx/simulate.ts (Alchemy) + src/domain/wc/explain.ts + src/domain/security/goplus.ts :
 *    « Vous perdez / Vous recevez », risque, Verify ; Danger = Refuser par défaut + maintenir 2 s (ui/SignSheet.tsx).
 *  - src/security/pin.ts : LOCK_SCHEDULE_MS = 6 essais libres, puis 30 s, 1 min, 5 min, 15 min, 1 h.
 *  - src/security/vault.ts : AES-256-GCM, clé dérivée du PIN par scrypt ; stockage Keystore/Keychain.
 */
function Address({ head, mid, tail, danger }: { head: string; mid: string; tail: string; danger?: boolean }) {
  return (
    <code className="block break-all font-mono text-sm text-bone sm:text-base" dir="ltr">
      {head}
      <span className={danger ? 'rounded bg-[#ff6363]/20 px-0.5 text-[#ffb4b4]' : 'text-mist'}>{mid}</span>
      {tail}
    </code>
  );
}

export function NeverStolen({ t }: { t: Dict }) {
  const s = t.stolen;
  return (
    <section id="voler" className="scroll-mt-16 bg-ink px-5 py-20 sm:px-8 sm:py-24 lg:py-32">
      <div className="mx-auto max-w-page">
        <ChapterHead
          numeral="III"
          chapterWord={t.chapters.chapter}
          kicker={s.kicker}
          title={
            <>
              {s.title} <em className="italic text-sage">{s.titleEm}</em>
            </>
          }
          lead={s.lead}
        />

        <Stagger className="mt-16 grid gap-5 md:grid-cols-2 lg:mt-20 lg:grid-cols-3" gap={0.12}>
          {/* Scène 1 — le sosie */}
          <Item as="article" className="flex flex-col rounded-[2rem] bg-ink-2 p-7 sm:p-8">
            <p className="font-display text-sm text-sage">{s.scene} 1 · {s.s1.kicker}</p>
            <h3 className="mt-3 font-display text-2xl leading-tight text-paper">{s.s1.title}</h3>
            <p className="mt-3 text-sm font-light leading-relaxed text-mist">{s.s1.text}</p>
            <div className="mt-6 space-y-3 rounded-2xl border border-bone/10 bg-ink-3 p-4">
              <div>
                <p className="mb-1 text-[11px] uppercase tracking-[0.18em] text-mist/70">{s.s1.friend}</p>
                <Address head="0x7a3F" mid="c1D94e2B8f0a6C3e91b7D2a4F58c0E1d" tail="9c2E" />
              </div>
              <div>
                <p className="mb-1 text-[11px] uppercase tracking-[0.18em] text-[#ffb4b4]">{s.s1.lookalike}</p>
                <Address head="0x7a3F" mid="08bA71e3D5c26F9a4B0e8C7d1A6f3E2b" tail="9c2E" danger />
              </div>
            </div>
            <p className="mt-auto pt-6 font-display text-xl text-paper">
              {s.s1.closing1} <em className="italic text-sage">{s.s1.closingEm}</em>
              {s.s1.closing2}
            </p>
          </Item>

          {/* Scène 2 — la signature traduite */}
          <Item as="article" className="flex flex-col rounded-[2rem] bg-ink-2 p-7 sm:p-8">
            <p className="font-display text-sm text-sage">{s.scene} 2 · {s.s2.kicker}</p>
            <h3 className="mt-3 font-display text-2xl leading-tight text-paper">{s.s2.title}</h3>
            <p className="mt-3 text-sm font-light leading-relaxed text-mist">{s.s2.text}</p>
            <div className="mt-6 rounded-2xl border border-bone/10 bg-ink-3 p-4 text-sm">
              <p className="text-xs text-mist">{s.s2.asks}</p>
              <p className="mt-3 flex justify-between text-bone">
                <span>{s.s2.lose}</span>
                <span className="font-mono" dir="ltr">50 USDC</span>
              </p>
              <p className="mt-1 flex justify-between text-bone">
                <span>{s.s2.receive}</span>
                <span className="font-mono" dir="ltr">0,021 ETH</span>
              </p>
              <p className="mt-3 inline-block rounded-full bg-sage/15 px-2.5 py-1 text-xs text-sage">{s.s2.lowRisk}</p>
            </div>
            <div className="mt-3 rounded-2xl border border-[#ff6363]/30 bg-[#ff6363]/5 p-4 text-sm">
              <p className="text-xs text-mist">{s.s2.unknownAsks}</p>
              <p className="mt-3 text-bone">{s.s2.approval}</p>
              <p className="mt-3 inline-block rounded-full bg-[#ff6363]/20 px-2.5 py-1 text-xs text-[#ffb4b4]">{s.s2.danger}</p>
            </div>
          </Item>

          {/* Scène 3 — le téléphone volé */}
          <Item as="article" className="flex flex-col rounded-[2rem] bg-ink-2 p-7 sm:p-8">
            <p className="font-display text-sm text-sage">{s.scene} 3 · {s.s3.kicker}</p>
            <h3 className="mt-3 font-display text-2xl leading-tight text-paper">{s.s3.title}</h3>
            <p className="mt-3 text-sm font-light leading-relaxed text-mist">{s.s3.text}</p>
            <ol className="mt-6 divide-y divide-bone/10 rounded-2xl border border-bone/10 bg-ink-3 text-sm">
              {s.s3.tries.map((tries, i) => (
                <li key={tries} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-mist">
                    {i === 0 || i === s.s3.tries.length - 1 ? s.s3.attempts : s.s3.attempt} {tries}
                  </span>
                  <span className="font-display text-bone">{s.s3.waits[i]}</span>
                </li>
              ))}
            </ol>
            <p className="mt-auto pt-6 text-sm font-light text-mist">{s.s3.closing}</p>
          </Item>
        </Stagger>

        <Reveal className="mt-14 border-t border-bone/10 pt-8 lg:text-center">
          <p className="max-w-3xl font-display text-2xl leading-snug text-paper sm:text-3xl lg:mx-auto">
            {s.footer1} <em className="italic text-sage">{s.footerEm}</em>
            {s.footer2}
          </p>
        </Reveal>
      </div>
    </section>
  );
}
