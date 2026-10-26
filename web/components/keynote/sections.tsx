import React from 'react';
import { Mark } from '../landing/mark';
import { BitcoinIcon, SolanaIcon, TonIcon } from '../landing/networks';
import { Reveal, Stagger, Item } from '../landing/motion';
import { SeedCard } from '../sun/seed-card';
import { CountUp } from '../sun/alive';
import type { Dict } from '../../i18n';
import { RELEASES_URL, SOURCE_URL } from '../../lib/links';

/*
 * Les sections « respiration » de la keynote : la nuit pour ce qui protège,
 * le crème de l'app pour ce qui se garde à la main, des chiffres en grand.
 */

function EthIcon({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="#627EEA">
      <path d="M11.944 17.97 4.58 13.62 11.943 24l7.37-10.38-7.372 4.35h.003zM12.056 0 4.69 12.223l7.365 4.354 7.365-4.35L12.056 0z" />
    </svg>
  );
}

/** Les réseaux, en grand et en silence, sous le dévoilement. */
export function Networks({ t }: { t: Dict }) {
  const chains = [
    { name: 'Bitcoin', icon: <BitcoinIcon size={22} /> },
    { name: 'Ethereum', icon: <EthIcon /> },
    { name: 'Solana', icon: <SolanaIcon size={22} /> },
    { name: 'TON', icon: <TonIcon size={22} /> },
  ];
  return (
    <section aria-label={t.networks.label} className="bg-black px-5 pb-8 pt-20 text-center sm:px-8">
      <Stagger as="ul" className="mx-auto flex max-w-page flex-wrap items-center justify-center gap-x-10 gap-y-4" gap={0.08}>
        {chains.map((c) => (
          <Item key={c.name} as="li" className="flex items-center gap-2.5 text-lg font-semibold text-white">
            {c.icon}
            {c.name}
          </Item>
        ))}
      </Stagger>
      <p className="mx-auto mt-5 max-w-2xl text-[15px] text-white/50">
        {t.networks.walletconnect}. {t.networks.soon}
      </p>
    </section>
  );
}

/** Ne jamais la perdre : la feuille de papier, en clair. */
export function Keep({ t }: { t: Dict }) {
  return (
    <section id="perdre" className="scroll-mt-12 bg-ink px-5 py-24 sm:px-8 sm:py-32">
      <div className="mx-auto max-w-page">
        <Reveal as="p" className="text-center text-sm font-semibold text-sage">
          {t.lose.kicker}
        </Reveal>
        <Reveal as="h2" className="mx-auto mt-3 max-w-4xl text-center font-display text-[2.6rem] font-semibold leading-[1.05] tracking-[-0.035em] text-paper [text-wrap:balance] sm:text-6xl lg:text-7xl">
          {t.lose.title} <span className="text-paper/40">{t.lose.titleEm}</span>
        </Reveal>
        <Reveal as="p" delay={0.1} className="mx-auto mt-6 max-w-2xl text-center text-[17px] leading-relaxed text-mist sm:text-xl">
          {t.lose.lead}
        </Reveal>
        <Reveal delay={0.15} className="mx-auto mt-14 max-w-2xl">
          <SeedCard t={t} />
        </Reveal>
        <div className="mt-16 grid gap-10 sm:grid-cols-3">
          {t.lose.rituals.map((r, i) => (
            <Reveal key={r.title} delay={i * 0.08}>
              <p className="font-display text-5xl font-semibold tracking-[-0.04em] text-paper/15">{i + 1}</p>
              <h3 className="mt-3 text-xl font-semibold tracking-[-0.02em] text-paper">{r.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-mist">{r.text}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Le copilote : un halo de couleurs, comme une intelligence qui s'allume. */
export function Copilot({ t }: { t: Dict }) {
  return (
    <section id="copilote" className="relative scroll-mt-12 overflow-hidden bg-black px-5 py-28 sm:px-8 sm:py-36">
      <div aria-hidden className="ai-glow pointer-events-none absolute left-1/2 top-24 h-[520px] w-[900px] max-w-[160vw] -translate-x-1/2 rounded-full opacity-50 blur-[120px]" />
      <div className="relative mx-auto max-w-page text-center">
        <Reveal as="p" className="text-sm font-semibold text-white/60">
          {t.ai.kicker}
        </Reveal>
        <Reveal as="h2" className="mx-auto mt-3 max-w-4xl font-display text-[2.6rem] font-semibold leading-[1.05] tracking-[-0.035em] [text-wrap:balance] sm:text-6xl lg:text-7xl">
          <span className="text-white">{t.ai.title}</span> <span className="grad-ai">{t.ai.titleEm}</span>
        </Reveal>
        <Reveal as="p" delay={0.1} className="mx-auto mt-6 max-w-2xl text-[17px] leading-relaxed text-white/60 sm:text-xl">
          {t.ai.lead}
        </Reveal>
        <div className="mt-16 grid gap-4 text-left sm:grid-cols-2 lg:grid-cols-4">
          {t.ai.items.map((it, i) => (
            <Reveal key={it.label} delay={i * 0.06} className="ai-border rounded-[24px] p-[1px]">
              <div className="h-full rounded-[23px] bg-[#0E0E12] p-7">
                <CountUp value={it.value} className="block font-display text-6xl font-semibold leading-none tracking-[-0.05em] text-white" />
                <p className="mt-5 text-lg font-semibold leading-snug text-white">{it.label}</p>
                <p className="mt-2 text-sm leading-relaxed text-white/55">{it.note}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal as="p" className="mx-auto mt-14 max-w-3xl text-xl leading-relaxed text-white/80 sm:text-2xl">
          {t.ai.p1a}
          <span className="font-semibold text-white">{t.ai.p1em}</span>
          {t.ai.p1b}
        </Reveal>
        <Reveal as="p" delay={0.1} className="mx-auto mt-5 max-w-2xl text-[15px] leading-relaxed text-white/50">
          {t.ai.p2}
        </Reveal>
      </div>
    </section>
  );
}

/** Les frais : un seul chiffre compte, puis le ticket. */
export function Fees({ t }: { t: Dict }) {
  const swap = t.fees.items[1];
  return (
    <section id="frais" className="scroll-mt-12 bg-ink px-5 py-24 sm:px-8 sm:py-32">
      <div className="mx-auto max-w-page text-center">
        <Reveal as="p" className="text-sm font-semibold text-sage">
          {t.fees.kicker}
        </Reveal>
        <Reveal as="h2" className="mx-auto mt-3 max-w-4xl font-display text-[2.6rem] font-semibold leading-[1.05] tracking-[-0.035em] text-paper sm:text-6xl lg:text-7xl">
          {t.fees.title} <span className="text-paper/40">{t.fees.titleEm}</span>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="grad-earth mt-10 font-display text-[30vw] font-semibold leading-[0.9] tracking-[-0.06em] sm:text-[16rem]">{swap.value}</p>
          <p className="mx-auto mt-2 max-w-xl text-xl font-semibold text-paper">{swap.label}</p>
          <p className="mx-auto mt-2 max-w-xl text-[15px] text-mist">{swap.note}</p>
        </Reveal>
        <p className="mx-auto mt-10 max-w-2xl text-[17px] leading-relaxed text-mist">{t.fees.lead}</p>
      </div>
      <Reveal className="mx-auto mt-14 max-w-2xl">
        <div className="receipt relative bg-ink-2 px-6 pb-10 pt-8 shadow-phone sm:px-10">
          <div className="flex items-center justify-between border-b border-dashed border-paper/20 pb-5">
            <span className="flex items-center gap-2 font-display text-lg font-semibold text-paper">
              <Mark size={18} className="text-sage" /> Kalyx
            </span>
            <span className="font-mono text-xs uppercase tracking-[0.16em] text-mist">{t.fees.kicker}</span>
          </div>
          <ul className="divide-y divide-dashed divide-paper/15">
            {t.fees.items.map((it) => (
              <li key={it.label} className="py-4">
                <div className="flex items-baseline gap-3">
                  <span className="text-base font-semibold text-paper">{it.label}</span>
                  <span aria-hidden className="mb-1 flex-1 border-b border-dotted border-paper/25" />
                  <span className="whitespace-nowrap font-mono text-lg font-semibold tabular-nums text-paper">{it.value}</span>
                </div>
                <p className="mt-1 max-w-[85%] text-sm text-mist">{it.note}</p>
              </li>
            ))}
          </ul>
        </div>
      </Reveal>
      <div className="mx-auto mt-14 grid max-w-page gap-8 text-[15px] leading-relaxed sm:grid-cols-2 lg:px-24">
        <Reveal as="p" className="text-paper">
          {t.fees.p1a} <span className="font-semibold">{t.fees.p1em}</span>
          {t.fees.p1b}
        </Reveal>
        <Reveal as="p" delay={0.08} className="text-mist">
          {t.fees.p2}
        </Reveal>
      </div>
    </section>
  );
}

/** Les chiffres du projet, alignés comme une fiche technique. */
export function Specs({ t }: { t: Dict }) {
  return (
    <section className="bg-black px-5 pb-24 sm:px-8">
      <div className="mx-auto grid max-w-page grid-cols-2 gap-y-10 border-t border-white/15 pt-12 sm:grid-cols-4">
        {['65', '15', '270', '0'].map((v, i) => (
          <div key={t.vision.stats[i]} className="text-center">
            <CountUp value={v} className="grad-warm block font-display text-6xl font-semibold leading-none tracking-[-0.05em] sm:text-7xl" />
            <p className="mt-3 text-[15px] text-white/55">{t.vision.stats[i]}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Sous la finale : la vérification du fichier, en ligne de commande. */
export function Verify({ t }: { t: Dict }) {
  return (
    <div className="mx-auto mt-12 max-w-xl rounded-2xl bg-black/35 p-4 text-left font-mono text-xs leading-relaxed text-white/80 ring-1 ring-white/10 backdrop-blur">
      <p className="text-white/55">{t.download.verify}</p>
      <p className="mt-2" dir="ltr">
        <span className="text-[#E6C682]">$</span> sha256sum kalyx-wallet.apk
      </p>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-white">
          {t.download.verifyLink} ↗
        </a>
        <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-white">
          {t.footer.source} ↗
        </a>
      </p>
      <p className="mt-3 font-sans text-white/50">{t.download.note}</p>
    </div>
  );
}
