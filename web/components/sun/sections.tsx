import React from 'react';
import {
  ArrowLeftRight, ArrowUpRight, Bot, Download as DownloadIcon, Globe, KeyRound, Layers, Monitor, Send, ShieldCheck, Sprout,
} from 'lucide-react';
import { Item, Reveal, Stagger } from '../landing/motion';
import { BitcoinIcon, SolanaIcon, TonIcon } from '../landing/networks';
import { Mark } from '../landing/mark';
import { Landscape } from './landscape';
import { Phone } from './phone';
import { CountUp, FloatingPhone, Magnetic, PlayOnView, Spotlight, VisionLines, Words } from './alive';
import { SeedCard } from './seed-card';
import type { Dict } from '../../i18n';
import { APK_URL } from '../../lib/apk';
import { RELEASES_URL, SOURCE_URL, WEB_APP_URL } from '../../lib/links';

/* ------------------------------------------------------------------ */
/* Briques                                                             */
/* ------------------------------------------------------------------ */

/** En-tête de section : pastille, titre gras (la fin en or), chapeau. */
function Head({ kicker, title, em, lead, center = false, light = false }: { kicker: string; title: string; em?: string; lead?: string; center?: boolean; light?: boolean }) {
  return (
    <div className={center ? 'mx-auto max-w-3xl text-center' : 'max-w-3xl'}>
      <Reveal as="p" className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${light ? 'bg-white/15 text-white' : 'bg-tint-earn text-tint-earnInk'}`}>
        <Mark size={12} />
        {kicker}
      </Reveal>
      <Words
        parts={[[title], ...(em ? [[em, light ? 'text-[#F1CF8A]' : 'text-sage'] as [string, string]] : [])]}
        className={`mt-5 font-display text-[2.1rem] leading-[1.08] sm:text-5xl ${light ? 'text-white' : 'text-paper'}`}
      />
      {lead ? (
        <Reveal as="p" delay={0.1} className={`mt-5 text-base leading-relaxed sm:text-lg ${light ? 'text-white/80' : 'text-mist'}`}>
          {lead}
        </Reveal>
      ) : null}
    </div>
  );
}

const card = 'rounded-[1.75rem] bg-ink-2 p-6 shadow-card ring-1 ring-cream-line sm:p-7';

function Section({ id, children, className = '' }: { id?: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={`scroll-mt-24 px-5 py-20 sm:px-8 sm:py-28 ${className}`}>
      <div className="mx-auto max-w-page">{children}</div>
    </section>
  );
}

function ApkButton({ label, light = false }: { label: string; light?: boolean }) {
  return (
    <Magnetic>
    <a
      href={APK_URL}
      download
      className={`inline-flex h-12 items-center justify-center gap-2 rounded-full px-7 text-sm font-semibold transition-transform duration-200 active:scale-[0.97] ${light ? 'bg-white text-paper hover:bg-ink-2' : 'bg-paper text-ink hover:bg-bone'}`}
    >
      <DownloadIcon className="h-4 w-4" aria-hidden />
      {label}
    </a>
    </Magnetic>
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
      <div className="relative mx-auto grid max-w-page items-end gap-12 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="pb-4 text-white lg:pb-40">
          <Reveal as="p" delay={1.15} className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur">
            <Mark size={12} className="text-[#F1CF8A]" />
            {t.hero.kicker}
          </Reveal>
          <Words
            as="h1"
            delay={1.25}
            parts={[[`${t.hero.line1} ${t.hero.line2}`], [t.hero.line3, 'text-[#F1CF8A]']]}
            className="mt-6 font-display text-[2.7rem] leading-[1.02] sm:text-6xl lg:text-7xl"
          />
          <Reveal as="p" delay={1.6} className="mt-6 max-w-xl text-base leading-relaxed text-white/85 sm:text-lg">
            {t.hero.sub}
          </Reveal>
          <Reveal delay={1.75} className="mt-9 flex flex-col gap-3 sm:flex-row">
            <ApkButton label={t.hero.cta} light />
            <Magnetic>
            <a
              href={WEB_APP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white/15 px-6 text-sm font-semibold text-white ring-1 ring-white/30 backdrop-blur transition-colors hover:bg-white/25"
            >
              <Monitor className="h-4 w-4" aria-hidden />
              {t.nav.webApp}
            </a>
            </Magnetic>
          </Reveal>
          <Stagger as="ul" className="mt-8 flex flex-wrap gap-2" gap={0.07}>
            {t.hero.chips.map((c) => (
              <Item key={c} as="li" className="rounded-full bg-black/20 px-3 py-1.5 text-xs font-medium text-white/90 ring-1 ring-white/15 backdrop-blur">
                {c}
              </Item>
            ))}
          </Stagger>
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
/* Réseaux                                                             */
/* ------------------------------------------------------------------ */

function EthIcon() {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} aria-hidden fill="#627EEA">
      <path d="M11.944 17.97 4.58 13.62 11.943 24l7.37-10.38-7.372 4.35h.003zM12.056 0 4.69 12.223l7.365 4.354 7.365-4.35L12.056 0z" />
    </svg>
  );
}

export function SunNetworks({ t }: { t: Dict }) {
  const chains = [
    { name: 'Bitcoin', icon: <BitcoinIcon /> },
    { name: 'Ethereum', icon: <EthIcon /> },
    { name: 'Solana', icon: <SolanaIcon /> },
    { name: 'TON', icon: <TonIcon /> },
  ];
  return (
    <section aria-label={t.networks.label} className="relative bg-ink px-5 pb-6 pt-28 sm:px-8 lg:pt-36">
      <div className="mx-auto flex max-w-page flex-col items-center gap-4 text-center">
        <Stagger as="ul" className="flex flex-wrap items-center justify-center gap-2.5" gap={0.08}>
          {chains.map((c) => (
            <Item key={c.name} as="li" lift className="flex items-center gap-2 rounded-full bg-ink-2 py-1.5 pl-1.5 pr-3.5 shadow-card ring-1 ring-cream-line">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink-3">{c.icon}</span>
              <span className="text-sm font-semibold text-paper">{c.name}</span>
            </Item>
          ))}
          <Item as="li" lift className="rounded-full bg-tint-buy px-3.5 py-2 text-sm font-semibold text-tint-buyInk">{t.networks.walletconnect}</Item>
        </Stagger>
        <p className="max-w-2xl text-sm text-mist">{t.networks.soon}</p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Comment ça marche : six cartes teintées                             */
/* ------------------------------------------------------------------ */

const HOW_STYLE = [
  { bg: 'bg-tint-buy', ink: 'text-tint-buyInk', Icon: Layers },
  { bg: 'bg-tint-send', ink: 'text-tint-sendInk', Icon: Send },
  { bg: 'bg-tint-swap', ink: 'text-tint-swapInk', Icon: ArrowLeftRight },
  { bg: 'bg-tint-earn', ink: 'text-tint-earnInk', Icon: Sprout },
  { bg: 'bg-tint-receive', ink: 'text-tint-receiveInk', Icon: Globe },
  { bg: 'bg-tint-buy', ink: 'text-tint-buyInk', Icon: Monitor },
];

export function SunHow({ t }: { t: Dict }) {
  return (
    <Section id="fonctionnement">
      <Head kicker={t.how.kicker} title={t.how.title} em={t.how.titleEm} />
      <Stagger className="mt-12 grid gap-4 sm:grid-cols-2 lg:mt-16 lg:grid-cols-3" gap={0.08}>
        {t.how.steps.map((s, i) => {
          const st = HOW_STYLE[i % HOW_STYLE.length];
          return (
            <Item key={s.title} as="article" className="h-full">
              <Spotlight className={`${card} group flex h-full flex-col`}>
              <div className="flex items-start justify-between gap-4">
                <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${st.bg} transition-transform duration-500 ease-editorial group-hover:-rotate-6 group-hover:scale-110`}>
                  <st.Icon className={`h-5 w-5 ${st.ink}`} strokeWidth={2.2} aria-hidden />
                </span>
                <span className="text-right">
                  <CountUp value={s.value} className={`block font-display text-3xl leading-none ${st.ink}`} />
                  <span className="mt-1 block max-w-[10rem] text-xs text-mist">{s.label}</span>
                </span>
              </div>
              <h3 className="mt-6 text-xl font-semibold leading-snug text-paper">{s.title}</h3>
              <p className="mt-2 text-[0.95rem] leading-relaxed text-mist">{s.text}</p>
              </Spotlight>
            </Item>
          );
        })}
      </Stagger>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Ne jamais la perdre                                                 */
/* ------------------------------------------------------------------ */

export function SunLose({ t }: { t: Dict }) {
  return (
    <Section id="perdre" className="bg-ink-3/60">
      <Head kicker={t.lose.kicker} title={t.lose.title} em={t.lose.titleEm} lead={t.lose.lead} />
      <div className="mt-12 grid gap-10 lg:mt-16 lg:grid-cols-2 lg:gap-16">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <SeedCard t={t} />
        </div>
        <Stagger as="ol" className="grid gap-4" gap={0.1}>
          {t.lose.rituals.map((r, i) => (
            <Item key={r.title} as="li" className={`${card} grid grid-cols-[2.75rem_1fr] gap-4`}>
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-tint-earn font-display text-lg text-tint-earnInk">{i + 1}</span>
              <div>
                <h3 className="text-xl font-semibold leading-snug text-paper">{r.title}</h3>
                <p className="mt-2 text-[0.95rem] leading-relaxed text-mist">{r.text}</p>
              </div>
            </Item>
          ))}
        </Stagger>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Ne jamais se faire voler : cinq scènes                              */
/* ------------------------------------------------------------------ */

function Address({ head, mid, tail, danger }: { head: string; mid: string; tail: string; danger?: boolean }) {
  return (
    <code className="block break-all font-mono text-[0.8rem] text-paper" dir="ltr">
      {head}
      <span className={danger ? 'rounded bg-tint-send px-0.5 text-tint-sendInk' : 'text-mist'}>{mid}</span>
      {tail}
    </code>
  );
}

function SceneTag({ n, label, label2 }: { n: string; label: string; label2: string }) {
  return (
    <p className="text-xs font-semibold text-sage">
      {label} {n} · {label2}
    </p>
  );
}

export function SunStolen({ t }: { t: Dict }) {
  const s = t.stolen;
  const inner = 'mt-5 rounded-2xl bg-ink-3 p-4 text-sm';
  return (
    <Section id="voler">
      <Head kicker={s.kicker} title={s.title} em={s.titleEm} lead={s.lead} />
      <Stagger className="mt-12 grid gap-4 md:grid-cols-2 lg:mt-16 lg:grid-cols-3" gap={0.08}>
        <Item as="article" tilt className={`${card} flex h-full flex-col`}>
          <SceneTag n="1" label={s.scene} label2={s.s1.kicker} />
          <h3 className="mt-2 text-xl font-semibold leading-snug text-paper">{s.s1.title}</h3>
          <p className="mt-2 text-[0.95rem] leading-relaxed text-mist">{s.s1.text}</p>
          <div className={`${inner} space-y-3`}>
            <div>
              <p className="mb-1 text-xs font-medium text-mist">{s.s1.friend}</p>
              <Address head="0x7a3F" mid="c1D94e2B8f0a6C3e91b7D2a4F58c0E1d" tail="9c2E" />
            </div>
            <PlayOnView className="relative">
              <div className="shake-in">
                <p className="mb-1 text-xs font-medium text-tint-sendInk">{s.s1.lookalike}</p>
                <Address head="0x7a3F" mid="08bA71e3D5c26F9a4B0e8C7d1A6f3E2b" tail="9c2E" danger />
              </div>
              <span className="stamp-in absolute -right-1 -top-2 rounded-lg bg-tint-sendInk px-2 py-0.5 text-xs font-bold uppercase text-white shadow-card">{s.s1.closingEm}</span>
            </PlayOnView>
          </div>
          <p className="mt-auto pt-5 font-semibold text-paper">
            {s.s1.closing1} <span className="text-tint-sendInk">{s.s1.closingEm}</span>
            {s.s1.closing2}
          </p>
        </Item>

        <Item as="article" tilt className={`${card} flex h-full flex-col`}>
          <SceneTag n="2" label={s.scene} label2={s.s2.kicker} />
          <h3 className="mt-2 text-xl font-semibold leading-snug text-paper">{s.s2.title}</h3>
          <p className="mt-2 text-[0.95rem] leading-relaxed text-mist">{s.s2.text}</p>
          <div className={inner}>
            <p className="text-xs text-mist">{s.s2.asks}</p>
            <p className="mt-3 flex justify-between text-paper"><span>{s.s2.lose}</span><span className="font-mono" dir="ltr">50 USDC</span></p>
            <p className="mt-1 flex justify-between text-paper"><span>{s.s2.receive}</span><span className="font-mono" dir="ltr">0,021 ETH</span></p>
            <p className="mt-3 inline-block rounded-full bg-tint-receive px-2.5 py-1 text-xs font-medium text-tint-receiveInk">{s.s2.lowRisk}</p>
          </div>
          <div className="mt-3 rounded-2xl bg-tint-send/60 p-4 text-sm">
            <p className="text-xs text-mist">{s.s2.unknownAsks}</p>
            <p className="mt-2 text-paper">{s.s2.approval}</p>
            <p className="mt-3 inline-block rounded-full bg-tint-send px-2.5 py-1 text-xs font-medium text-tint-sendInk">{s.s2.danger}</p>
          </div>
        </Item>

        <Item as="article" tilt className={`${card} flex h-full flex-col`}>
          <SceneTag n="3" label={s.scene} label2={s.s3.kicker} />
          <h3 className="mt-2 text-xl font-semibold leading-snug text-paper">{s.s3.title}</h3>
          <p className="mt-2 text-[0.95rem] leading-relaxed text-mist">{s.s3.text}</p>
          <ol className="mt-5 divide-y divide-cream-line rounded-2xl bg-ink-3 text-sm">
            {s.s3.tries.map((tries, i) => (
              <li key={tries} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-mist">{i === 0 || i === s.s3.tries.length - 1 ? s.s3.attempts : s.s3.attempt} {tries}</span>
                <span className="font-semibold text-paper">{s.s3.waits[i]}</span>
              </li>
            ))}
          </ol>
          <p className="mt-auto pt-5 text-sm text-mist">{s.s3.closing}</p>
        </Item>

        {([['4', s.s4], ['5', s.s5]] as const).map(([n, sc]) => (
          <Item key={n} as="article" tilt className={`${card} flex h-full flex-col`}>
            <SceneTag n={n} label={s.scene} label2={sc.kicker} />
            <h3 className="mt-2 text-xl font-semibold leading-snug text-paper">{sc.title}</h3>
            <p className="mt-2 text-[0.95rem] leading-relaxed text-mist">{sc.text}</p>
            <ul className="mt-5 divide-y divide-cream-line rounded-2xl bg-ink-3 text-sm">
              {sc.rows.map(([label, value]) => (
                <li key={label} className="flex items-center justify-between gap-4 px-4 py-2.5">
                  <span className="text-mist">{label}</span>
                  <span className="text-right font-semibold text-paper">{value}</span>
                </li>
              ))}
            </ul>
            <p className="mt-auto pt-5 text-sm text-mist">{sc.closing}</p>
          </Item>
        ))}

        {/* Sixième case : la conclusion, sur la nuit de l'app. */}
        <Item as="article" className="relative flex flex-col justify-end overflow-hidden rounded-[1.75rem] p-6 shadow-card sm:p-7">
          <Landscape id="stolen" phase="night" sunAt={0.28} veil parallax="through" />
          <ShieldCheck className="relative h-8 w-8 text-[#F1CF8A]" aria-hidden />
          <p className="relative mt-4 text-lg font-semibold leading-snug text-white">
            {s.footer1} <span className="text-[#F1CF8A]">{s.footerEm}</span>
            {s.footer2}
          </p>
        </Item>
      </Stagger>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Copilote IA et frais : chiffres sur cartes                          */
/* ------------------------------------------------------------------ */

function Figures({ items, tone }: { items: readonly { value: string; label: string; note: string }[]; tone: { bg: string; ink: string } }) {
  const cols = items.length === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3';
  return (
    <Stagger className={`mt-12 grid gap-4 sm:grid-cols-2 ${cols}`} gap={0.07}>
      {items.map((it) => (
        <Item key={it.label} as="article" tilt className={`${card} h-full`}>
          <span className={`inline-flex rounded-2xl px-3 py-1.5 font-display text-2xl ${tone.bg} ${tone.ink}`}>{it.value}</span>
          <h3 className="mt-4 text-lg font-semibold leading-snug text-paper">{it.label}</h3>
          <p className="mt-2 text-[0.95rem] leading-relaxed text-mist">{it.note}</p>
        </Item>
      ))}
    </Stagger>
  );
}

export function SunAi({ t }: { t: Dict }) {
  return (
    <Section id="copilote" className="bg-ink-3/60">
      <div className="flex items-start gap-4">
        <Head kicker={t.ai.kicker} title={t.ai.title} em={t.ai.titleEm} lead={t.ai.lead} />
        <span className="ml-auto hidden h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-tint-swap lg:flex">
          <Bot className="h-7 w-7 text-tint-swapInk" aria-hidden />
        </span>
      </div>
      <Figures items={t.ai.items} tone={{ bg: 'bg-tint-swap', ink: 'text-tint-swapInk' }} />
      <Reveal className="mt-8 grid gap-4 lg:grid-cols-2">
        <p className={`${card} text-[0.95rem] leading-relaxed text-mist`}>
          {t.ai.p1a}
          <span className="font-semibold text-paper">{t.ai.p1em}</span>
          {t.ai.p1b}
        </p>
        <p className={`${card} text-[0.95rem] leading-relaxed text-mist`}>{t.ai.p2}</p>
      </Reveal>
    </Section>
  );
}

export function SunFees({ t }: { t: Dict }) {
  return (
    <Section id="frais">
      <Head kicker={t.fees.kicker} title={t.fees.title} em={t.fees.titleEm} lead={t.fees.lead} />
      <Figures items={t.fees.items} tone={{ bg: 'bg-tint-receive', ink: 'text-tint-receiveInk' }} />
      <Reveal className="mt-8 grid gap-4 lg:grid-cols-2">
        <p className={`${card} text-[0.95rem] leading-relaxed text-mist`}>
          {t.fees.p1a} <span className="font-semibold text-paper">{t.fees.p1em}</span>
          {t.fees.p1b}
        </p>
        <p className={`${card} text-[0.95rem] leading-relaxed text-mist`}>{t.fees.p2}</p>
      </Reveal>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Vision                                                              */
/* ------------------------------------------------------------------ */

const VISION_ICONS = [ShieldCheck, KeyRound, Send, ArrowUpRight, Layers, Globe, Sprout];

export function SunVision({ t }: { t: Dict }) {
  return (
    <Section id="vision" className="bg-ink-3/60">
      <Head kicker={t.vision.kicker} title={t.vision.title} em={t.vision.titleEm} center />
      <VisionLines
        items={t.vision.lines.map((l, i) => {
          const Icon = VISION_ICONS[i % VISION_ICONS.length];
          return { text: l, icon: <Icon className="h-5 w-5 shrink-0 text-sage" aria-hidden /> };
        })}
      />
      <Reveal className="mx-auto mt-12 grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4">
        {['65', '15', '190+', '0'].map((v, i) => (
          <div key={t.vision.stats[i]} className="rounded-2xl bg-ink-2 p-5 text-center shadow-card ring-1 ring-cream-line">
            <CountUp value={v} className="block font-display text-4xl leading-none text-paper" />
            <p className="mt-2 text-sm text-mist">{t.vision.stats[i]}</p>
          </div>
        ))}
      </Reveal>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Téléchargement : retour sous le ciel                                */
/* ------------------------------------------------------------------ */

export function SunDownload({ t }: { t: Dict }) {
  return (
    <section id="telecharger" className="scroll-mt-24 px-5 py-16 sm:px-8 sm:py-24">
      <div className="relative mx-auto max-w-page overflow-hidden rounded-[2.5rem] px-6 py-16 text-center shadow-phone sm:px-12 sm:py-24">
        <Landscape id="download" phase="dawn" sunAt={0.24} sunX={0.84} veil parallax="through" rise />
        <div className="relative">
          <Mark size={44} className="spin-slow mx-auto text-[#F1CF8A]" />
          <Words
            parts={[[t.download.title], [t.download.titleEm, 'text-[#F1CF8A]']]}
            className="mx-auto mt-6 max-w-3xl font-display text-[2.1rem] leading-[1.08] text-white sm:text-5xl"
          />
          <Reveal as="p" delay={0.1} className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-white/85">
            {t.download.sub}
          </Reveal>
          <Reveal delay={0.18} className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <ApkButton label={t.download.cta} light />
            <Magnetic>
            <a
              href="https://t.me/kalyxntw"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white/15 px-6 text-sm font-semibold text-white ring-1 ring-white/30 backdrop-blur transition-colors hover:bg-white/25"
            >
              <Send className="h-4 w-4" aria-hidden />
              {t.download.telegram}
            </a>
            </Magnetic>
          </Reveal>
          <p className="mt-6 text-xs text-white/75">{t.download.note}</p>
          <p className="mx-auto mt-3 max-w-md text-xs leading-relaxed text-white/75">
            {t.download.verify}{' '}
            <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-white">
              {t.download.verifyLink}
            </a>
            {' · '}
            <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-white">
              {t.footer.source}
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
