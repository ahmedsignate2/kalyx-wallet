import React from 'react';
import { ArrowUpRight, Download as DownloadIcon, Send } from 'lucide-react';
import { Item, Reveal, Stagger } from '../landing/motion';
import { BitcoinIcon, SolanaIcon, TonIcon } from '../landing/networks';
import { Mark } from '../landing/mark';
import { Landscape } from './landscape';
import { Phone } from './phone';
import { SeedCard } from './seed-card';
import { CountUp, FloatingPhone, VisionLines } from './alive';
import { Decode, Duress, HoldToSend, Lookalike, PinLock, Whitelist } from './demos';
import type { Dict } from '../../i18n';
import { APK_URL } from '../../lib/apk';
import { RELEASES_URL, SOURCE_URL, WEB_APP_URL } from '../../lib/links';

/*
 * Mise en page éditoriale : des numéros de chapitre, des filets, de la grande
 * typographie et les gestes de l'app rejoués — pas de grilles de cartes
 * interchangeables. Le crème de l'app pour le jour, sa Nuit pour la sécurité.
 */

/* ------------------------------------------------------------------ */
/* Briques                                                             */
/* ------------------------------------------------------------------ */

/** En-tête de chapitre : numéro et nom en petites capitales, titre à gauche, chapeau à droite. */
function Head({ n, kicker, title, em, lead, dark = false }: { n: string; kicker: string; title: string; em?: string; lead?: string; dark?: boolean }) {
  return (
    <div className={`grid gap-6 border-t pt-6 lg:grid-cols-12 lg:gap-10 ${dark ? 'border-white/15' : 'border-paper/15'}`}>
      <Reveal as="p" className={`font-mono text-xs uppercase tracking-[0.16em] lg:col-span-12 ${dark ? 'text-white/50' : 'text-mist'}`}>
        <span className={dark ? 'text-[#E6C682]' : 'text-sage'}>{n}</span>&nbsp;&nbsp;{kicker}
      </Reveal>
      <Reveal as="h2" className={`font-display text-[2.4rem] leading-[1.02] [text-wrap:balance] sm:text-6xl lg:col-span-7 lg:text-[4.2rem] ${dark ? 'text-white' : 'text-paper'}`}>
        {title}
        {em ? <span className={`block font-medium ${dark ? 'text-white/55' : 'text-paper/45'}`}>{em}</span> : null}
      </Reveal>
      {lead ? (
        <Reveal as="p" delay={0.1} className={`self-end text-base leading-relaxed sm:text-lg lg:col-span-5 ${dark ? 'text-white/65' : 'text-mist'}`}>
          {lead}
        </Reveal>
      ) : null}
    </div>
  );
}

function Section({ id, children, className = '' }: { id?: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={`scroll-mt-24 px-5 py-20 sm:px-8 sm:py-28 lg:py-36 ${className}`}>
      <div className="mx-auto max-w-page">{children}</div>
    </section>
  );
}

function ApkButton({ label }: { label: string }) {
  return (
    <a
      href={APK_URL}
      download
      className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white px-7 text-sm font-semibold text-paper transition-[transform,background-color] duration-200 hover:bg-ink-2 active:scale-[0.97]"
    >
      <DownloadIcon className="h-4 w-4" aria-hidden />
      {label}
    </a>
  );
}

/* ------------------------------------------------------------------ */
/* Hero : le ciel de l'app                                             */
/* ------------------------------------------------------------------ */

export function SunHero({ t }: { t: Dict }) {
  return (
    <section id="prologue" className="relative z-20 px-5 pb-0 pt-28 sm:px-8 lg:min-h-[100svh] lg:pt-36">
      <Landscape id="hero" phase="auto" sunAt={0.3} sunAtMobile={0.6} sunXMobile={0.82} veil parallax="top" pointer />
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden opacity-[0.06] mix-blend-overlay">
        <div className="grain absolute -inset-[8%]" />
      </div>
      <div className="relative mx-auto grid max-w-page items-end gap-12 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="pb-4 text-white lg:pb-36">
          <Reveal as="p" delay={1.15} className="font-mono text-xs uppercase tracking-[0.16em] text-white/60">
            {t.hero.kicker}
          </Reveal>
          <Reveal as="h1" delay={1.25} className="mt-6 font-display text-[2.9rem] leading-[0.98] sm:text-7xl lg:text-[5.4rem]">
            {t.hero.line1} {t.hero.line2}
            <span className="block font-medium text-white/60">{t.hero.line3}</span>
          </Reveal>
          <Reveal as="p" delay={1.45} className="mt-7 max-w-md text-base leading-relaxed text-white/80 sm:text-lg">
            {t.hero.sub}
          </Reveal>
          <Reveal delay={1.6} className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <ApkButton label={t.hero.cta} />
            <a href={WEB_APP_URL} target="_blank" rel="noopener noreferrer" className="group inline-flex h-12 items-center justify-center gap-1.5 text-sm font-semibold text-white">
              <span className="border-b border-white/40 pb-0.5 transition-colors group-hover:border-white">{t.nav.webApp}</span>
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
            </a>
          </Reveal>
        </div>
        <div className="flex justify-center lg:justify-end">
          <FloatingPhone className="translate-y-16 lg:translate-y-24">
            <Phone />
          </FloatingPhone>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Réseaux : une ligne, pas un mur de logos                            */
/* ------------------------------------------------------------------ */

function EthIcon() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden fill="#627EEA">
      <path d="M11.944 17.97 4.58 13.62 11.943 24l7.37-10.38-7.372 4.35h.003zM12.056 0 4.69 12.223l7.365 4.354 7.365-4.35L12.056 0z" />
    </svg>
  );
}

export function SunNetworks({ t }: { t: Dict }) {
  const chains = [
    { name: 'Bitcoin', icon: <BitcoinIcon size={16} /> },
    { name: 'Ethereum', icon: <EthIcon /> },
    { name: 'Solana', icon: <SolanaIcon size={16} /> },
    { name: 'TON', icon: <TonIcon size={16} /> },
  ];
  return (
    <section aria-label={t.networks.label} className="relative px-5 pb-4 pt-32 sm:px-8 lg:pt-40">
      <div className="mx-auto flex max-w-page flex-col gap-4 border-y border-paper/10 py-5 lg:flex-row lg:items-center lg:justify-between">
        <ul className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {chains.map((c) => (
            <li key={c.name} className="flex items-center gap-2 text-sm font-semibold text-paper">
              {c.icon}
              {c.name}
            </li>
          ))}
          <li className="text-sm text-mist">+ {t.networks.walletconnect}</li>
        </ul>
        <p className="max-w-xl text-sm text-mist lg:text-right">{t.networks.soon}</p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 01 — Comment ça marche : un index                                   */
/* ------------------------------------------------------------------ */

const HOW_INK = ['text-tint-buyInk', 'text-tint-sendInk', 'text-tint-swapInk', 'text-tint-earnInk', 'text-tint-receiveInk', 'text-tint-buyInk'];
const HOW_BG = ['hover:bg-tint-buy/50', 'hover:bg-tint-send/50', 'hover:bg-tint-swap/50', 'hover:bg-tint-earn/50', 'hover:bg-tint-receive/50', 'hover:bg-tint-buy/50'];

export function SunHow({ t }: { t: Dict }) {
  return (
    <Section id="fonctionnement">
      <Head n="01" kicker={t.how.kicker} title={t.how.title} em={t.how.titleEm} />
      <Stagger as="ol" className="mt-14 border-b border-paper/10 lg:mt-20" gap={0.06}>
        {t.how.steps.map((s, i) => (
          <Item
            key={s.title}
            as="li"
            className={`grid grid-cols-[2.5rem_1fr] gap-x-4 gap-y-4 border-t border-paper/10 px-2 py-8 transition-colors duration-500 sm:grid-cols-[3rem_14rem_1fr] sm:gap-x-8 lg:grid-cols-[4rem_18rem_1fr] lg:py-10 ${HOW_BG[i]}`}
          >
            <span className="pt-2 font-mono text-xs text-mist">{String(i + 1).padStart(2, '0')}</span>
            <div className="flex items-center gap-4 sm:block">
              {i === 1 ? (
                <HoldToSend value={s.value} label={s.label} />
              ) : (
                <CountUp value={s.value} className={`block font-display text-5xl leading-none lg:text-6xl ${HOW_INK[i]}`} />
              )}
              <p className="text-sm text-mist sm:mt-2">{s.label}</p>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <h3 className="text-2xl font-semibold leading-tight text-paper lg:text-[1.7rem]">{s.title}</h3>
              <p className="mt-3 max-w-xl text-base leading-relaxed text-mist">{s.text}</p>
            </div>
          </Item>
        ))}
      </Stagger>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* 02 — Ne jamais la perdre                                            */
/* ------------------------------------------------------------------ */

export function SunLose({ t }: { t: Dict }) {
  return (
    <Section id="perdre">
      <Head n="02" kicker={t.lose.kicker} title={t.lose.title} em={t.lose.titleEm} lead={t.lose.lead} />
      <div className="mt-14 grid gap-12 lg:mt-20 lg:grid-cols-12 lg:gap-10">
        <div className="lg:sticky lg:top-28 lg:col-span-6 lg:self-start">
          <SeedCard t={t} />
        </div>
        <ol className="lg:col-span-5 lg:col-start-8">
          {t.lose.rituals.map((r, i) => (
            <Reveal as="li" key={r.title} delay={i * 0.08} className="border-t border-paper/10 py-8 first:border-t-0 first:pt-0">
              <span className="font-display text-6xl leading-none text-paper/15">{i + 1}</span>
              <h3 className="mt-3 text-2xl font-semibold leading-tight text-paper">{r.title}</h3>
              <p className="mt-3 text-base leading-relaxed text-mist">{r.text}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* 03 — Ne jamais se faire voler : la Nuit de l'app, cinq scènes jouées */
/* ------------------------------------------------------------------ */

function Scene({ n, label, kicker, title, text, children, foot }: { n: number; label: string; kicker: string; title: string; text: string; children: React.ReactNode; foot?: string }) {
  return (
    <article className="grid gap-8 border-t border-white/10 py-12 lg:grid-cols-12 lg:gap-10 lg:py-16">
      <div className="lg:col-span-5">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-white/45">
          {label} {n} — <span className="text-[#E6C682]">{kicker}</span>
        </p>
        <h3 className="mt-4 text-3xl font-semibold leading-tight text-white sm:text-4xl">{title}</h3>
        <p className="mt-4 text-base leading-relaxed text-white/65">{text}</p>
        {foot ? <p className="mt-4 text-sm leading-relaxed text-white/45">{foot}</p> : null}
      </div>
      <div className="rounded-[1.5rem] bg-[#17171F] p-6 ring-1 ring-white/[0.08] [box-shadow:inset_0_1px_0_rgba(255,244,230,0.12)] sm:p-8 lg:col-span-6 lg:col-start-7">{children}</div>
    </article>
  );
}

export function SunStolen({ t }: { t: Dict }) {
  const s = t.stolen;
  return (
    <section id="voler" className="relative scroll-mt-24 overflow-hidden bg-[#0B0B10] px-5 py-20 sm:px-8 sm:py-28 lg:py-36">
      {/* La nuit de l'app, en haut de la section : on y entre comme on passe à la Nuit. */}
      <div className="absolute inset-x-0 top-0 h-[60vh] opacity-60">
        <Landscape id="stolen" phase="night" sunAt={0.3} sunX={0.85} parallax="through" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0B0B10]/40 to-[#0B0B10]" />
      </div>
      <div className="relative mx-auto max-w-page">
        <Head n="03" kicker={s.kicker} title={s.title} em={s.titleEm} lead={s.lead} dark />
        <div className="mt-10 lg:mt-16">
          <Scene n={1} label={s.scene} kicker={s.s1.kicker} title={s.s1.title} text={s.s1.text}>
            <Lookalike s={s.s1} />
          </Scene>
          <Scene n={2} label={s.scene} kicker={s.s2.kicker} title={s.s2.title} text={s.s2.text}>
            <Decode s={s.s2} />
          </Scene>
          <Scene n={3} label={s.scene} kicker={s.s3.kicker} title={s.s3.title} text={s.s3.text} foot={s.s3.closing}>
            <PinLock s={s.s3} />
          </Scene>
          <Scene n={4} label={s.scene} kicker={s.s4.kicker} title={s.s4.title} text={s.s4.text} foot={s.s4.closing}>
            <Whitelist s={s.s4} />
          </Scene>
          <Scene n={5} label={s.scene} kicker={s.s5.kicker} title={s.s5.title} text={s.s5.text} foot={s.s5.closing}>
            <Duress s={s.s5} />
          </Scene>
        </div>
        <Reveal className="border-t border-white/10 pt-12 lg:pt-16">
          <p className="max-w-4xl text-2xl font-semibold leading-snug text-white sm:text-4xl">
            {s.footer1} <span className="text-[#E6C682]">{s.footerEm}</span>
            <span className="text-white/55">{s.footer2}</span>
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 04 — Copilote IA                                                    */
/* ------------------------------------------------------------------ */

export function SunAi({ t }: { t: Dict }) {
  return (
    <Section id="copilote">
      <Head n="04" kicker={t.ai.kicker} title={t.ai.title} em={t.ai.titleEm} lead={t.ai.lead} />
      <dl className="mt-14 grid border-b border-paper/10 sm:grid-cols-2 lg:mt-20 lg:grid-cols-4">
        {t.ai.items.map((it, i) => (
          <Reveal key={it.label} delay={i * 0.06} className={`border-t border-paper/10 py-8 sm:pr-6 ${i % 2 === 1 ? 'sm:border-l sm:pl-6' : ''} ${i === 2 ? 'lg:border-l lg:pl-6' : ''}`}>
            <dt>
              <CountUp value={it.value} className="block font-display text-6xl leading-none text-tint-swapInk" />
              <span className="mt-4 block text-lg font-semibold leading-snug text-paper">{it.label}</span>
            </dt>
            <dd className="mt-2 text-sm leading-relaxed text-mist">{it.note}</dd>
          </Reveal>
        ))}
      </dl>
      <div className="mt-12 grid gap-8 lg:grid-cols-12">
        <Reveal as="p" className="text-xl leading-relaxed text-paper lg:col-span-7">
          {t.ai.p1a}
          <span className="font-semibold">{t.ai.p1em}</span>
          {t.ai.p1b}
        </Reveal>
        <Reveal as="p" delay={0.1} className="text-base leading-relaxed text-mist lg:col-span-4 lg:col-start-9">
          {t.ai.p2}
        </Reveal>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* 05 — Les frais : un ticket                                          */
/* ------------------------------------------------------------------ */

export function SunFees({ t }: { t: Dict }) {
  return (
    <Section id="frais" className="bg-ink-3/70">
      <Head n="05" kicker={t.fees.kicker} title={t.fees.title} em={t.fees.titleEm} lead={t.fees.lead} />
      <div className="mt-14 grid gap-12 lg:mt-20 lg:grid-cols-12 lg:gap-10">
        <Reveal className="lg:col-span-7">
          {/* Le ticket : bords dentelés, chiffres alignés, une ligne par cas. */}
          <div className="receipt relative bg-ink-2 px-6 pb-10 pt-8 shadow-card sm:px-10">
            <div className="flex items-center justify-between border-b border-dashed border-paper/20 pb-5">
              <span className="flex items-center gap-2 font-display text-lg text-paper">
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
        <div className="space-y-6 lg:col-span-4 lg:col-start-9 lg:self-end">
          <Reveal as="p" className="text-lg leading-relaxed text-paper">
            {t.fees.p1a} <span className="font-semibold">{t.fees.p1em}</span>
            {t.fees.p1b}
          </Reveal>
          <Reveal as="p" delay={0.1} className="text-base leading-relaxed text-mist">
            {t.fees.p2}
          </Reveal>
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* 06 — Vision : un manifeste                                          */
/* ------------------------------------------------------------------ */

export function SunVision({ t }: { t: Dict }) {
  return (
    <Section id="vision">
      <Head n="06" kicker={t.vision.kicker} title={t.vision.title} em={t.vision.titleEm} />
      <VisionLines lines={t.vision.lines} />
      <Reveal className="mt-16 grid grid-cols-2 border-t border-paper/15 sm:grid-cols-4">
        {['65', '15', '190+', '0'].map((v, i) => (
          <div key={t.vision.stats[i]} className={`py-8 ${i % 2 === 1 ? 'border-l border-paper/10 pl-6' : ''} ${i === 2 ? 'sm:border-l sm:border-paper/10 sm:pl-6' : ''}`}>
            <CountUp value={v} className="block font-display text-6xl leading-none text-paper lg:text-7xl" />
            <p className="mt-3 text-sm text-mist">{t.vision.stats[i]}</p>
          </div>
        ))}
      </Reveal>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Épilogue : l'aube                                                   */
/* ------------------------------------------------------------------ */

export function SunDownload({ t }: { t: Dict }) {
  return (
    <section id="telecharger" className="relative scroll-mt-24 overflow-hidden px-5 pb-16 pt-28 sm:px-8 sm:pt-40">
      <Landscape id="download" phase="dawn" sunAt={0.34} sunX={0.78} veil parallax="through" rise />
      <div className="relative mx-auto max-w-page pb-[22vh] text-white">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-white/60">{t.download.kicker}</p>
        <Reveal as="h2" className="mt-6 max-w-4xl font-display text-[2.6rem] leading-[1] sm:text-7xl lg:text-[5.4rem]">
          {t.download.title}
          <span className="block font-medium text-white/60">{t.download.titleEm}</span>
        </Reveal>
        <Reveal as="p" delay={0.1} className="mt-7 max-w-md text-base leading-relaxed text-white/80 sm:text-lg">
          {t.download.sub}
        </Reveal>
        <Reveal delay={0.18} className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
          <ApkButton label={t.download.cta} />
          <a href="https://t.me/kalyxntw" target="_blank" rel="noopener noreferrer" className="group inline-flex h-12 items-center justify-center gap-2 text-sm font-semibold text-white">
            <Send className="h-4 w-4" aria-hidden />
            <span className="border-b border-white/40 pb-0.5 transition-colors group-hover:border-white">{t.download.telegram}</span>
          </a>
        </Reveal>
        <div className="mt-12 max-w-xl rounded-xl bg-black/35 p-4 font-mono text-xs leading-relaxed text-white/80 ring-1 ring-white/10 backdrop-blur">
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
        </div>
        <p className="mt-5 text-xs text-white/60">{t.download.note}</p>
      </div>
    </section>
  );
}
