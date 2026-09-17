import React from 'react';
import Image from 'next/image';
import { Reveal, Stagger, Item } from './motion';
import type { Dict } from '../../i18n';

/**
 * Vrais logos, pas des cercles lettrés :
 *  - Bitcoin / Solana / WalletConnect : tracés vectoriels simple-icons (CC0),
 *    couleur de marque officielle.
 *  - Avalanche / Sei : icônes DefiLlama, la MÊME source que l'app mobile
 *    (cf. src/domain/chains/icons.ts) — aucun tracé vectoriel officiel
 *    disponible pour ces deux-là, mais cohérence garantie entre site et app.
 */
function BitcoinIcon({ size = 15 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="#F7931A">
      <path d="M23.638 14.904c-1.602 6.43-8.113 10.34-14.542 8.736C2.67 22.05-1.244 15.525.362 9.105 1.962 2.67 8.475-1.243 14.9.358c6.43 1.605 10.342 8.115 8.738 14.548v-.002zm-6.35-4.613c.24-1.59-.974-2.45-2.64-3.03l.54-2.153-1.315-.33-.525 2.107c-.345-.087-.705-.167-1.064-.25l.526-2.127-1.32-.33-.54 2.165c-.285-.067-.565-.132-.84-.2l-1.815-.45-.35 1.407s.975.225.955.236c.535.136.63.486.615.766l-1.477 5.92c-.075.166-.24.406-.614.314.015.02-.96-.24-.96-.24l-.66 1.51 1.71.426.93.242-.54 2.19 1.32.327.54-2.17c.36.1.705.19 1.05.273l-.51 2.154 1.32.33.545-2.19c2.24.427 3.93.257 4.64-1.774.57-1.637-.03-2.58-1.217-3.196.854-.193 1.5-.76 1.68-1.93h.01zm-3.01 4.22c-.404 1.64-3.157.75-4.05.53l.72-2.9c.896.23 3.757.67 3.33 2.37zm.41-4.24c-.37 1.49-2.662.735-3.405.55l.654-2.64c.744.18 3.137.524 2.75 2.084v.006z" />
    </svg>
  );
}

function SolanaIcon({ size = 15 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="#9945FF">
      <path d="m23.8764 18.0313-3.962 4.1393a.9201.9201 0 0 1-.306.2106.9407.9407 0 0 1-.367.0742H.4599a.4689.4689 0 0 1-.2522-.0733.4513.4513 0 0 1-.1696-.1962.4375.4375 0 0 1-.0314-.2545.4438.4438 0 0 1 .117-.2298l3.9649-4.1393a.92.92 0 0 1 .3052-.2102.9407.9407 0 0 1 .3658-.0746H23.54a.4692.4692 0 0 1 .2523.0734.4531.4531 0 0 1 .1697.196.438.438 0 0 1 .0313.2547.4442.4442 0 0 1-.1169.2297zm-3.962-8.3355a.9202.9202 0 0 0-.306-.2106.941.941 0 0 0-.367-.0742H.4599a.4687.4687 0 0 0-.2522.0734.4513.4513 0 0 0-.1696.1961.4376.4376 0 0 0-.0314.2546.444.444 0 0 0 .117.2297l3.9649 4.1394a.9204.9204 0 0 0 .3052.2102c.1154.049.24.0744.3658.0746H23.54a.469.469 0 0 0 .2523-.0734.453.453 0 0 0 .1697-.1961.4382.4382 0 0 0 .0313-.2546.4444.4444 0 0 0-.1169-.2297zM.46 6.7225h18.7815a.9411.9411 0 0 0 .367-.0742.9202.9202 0 0 0 .306-.2106l3.962-4.1394a.4442.4442 0 0 0 .117-.2297.4378.4378 0 0 0-.0314-.2546.453.453 0 0 0-.1697-.196.469.469 0 0 0-.2523-.0734H4.7596a.941.941 0 0 0-.3658.0745.9203.9203 0 0 0-.3052.2102L.1246 5.9687a.4438.4438 0 0 0-.1169.2295.4375.4375 0 0 0 .0312.2544.4512.4512 0 0 0 .1692.196.4689.4689 0 0 0 .2518.0739z" />
    </svg>
  );
}

function WalletConnectIcon({ size = 15, color = '#3B99FC' }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill={color}>
      <path d="M4.913 7.519c3.915-3.831 10.26-3.831 14.174 0l.471.461a.483.483 0 0 1 0 .694l-1.611 1.577a.252.252 0 0 1-.354 0l-.649-.634c-2.73-2.673-7.157-2.673-9.887 0l-.694.68a.255.255 0 0 1-.355 0L4.397 8.719a.482.482 0 0 1 0-.693l.516-.507Zm17.506 3.263 1.434 1.404a.483.483 0 0 1 0 .694l-6.466 6.331a.508.508 0 0 1-.709 0l-4.588-4.493a.126.126 0 0 0-.178 0l-4.589 4.493a.508.508 0 0 1-.709 0L.147 12.88a.483.483 0 0 1 0-.694l1.434-1.404a.508.508 0 0 1 .709 0l4.589 4.493c.05.048.129.048.178 0l4.589-4.493a.508.508 0 0 1 .709 0l4.589 4.493c.05.048.128.048.178 0l4.589-4.493a.507.507 0 0 1 .708 0Z" />
    </svg>
  );
}

/** Icône de chaîne DefiLlama (CDN utilisé par l'app mobile), proxyée en PNG via wsrv.nl. */
function ChainRasterIcon({ slug, alt }: { slug: string; alt: string }) {
  const src = `https://wsrv.nl/?url=${encodeURIComponent(`icons.llamao.fi/icons/chains/rsz_${slug}.jpg`)}&output=png&w=48&h=48&fit=cover`;
  return <Image src={src} alt={alt} width={15} height={15} className="rounded-full" />;
}

const CHAINS: { name: string; icon: React.ReactNode }[] = [
  { name: 'Avalanche', icon: <ChainRasterIcon slug="avalanche" alt="" /> },
  { name: 'Sei', icon: <ChainRasterIcon slug="sei" alt="" /> },
  { name: 'Bitcoin', icon: <BitcoinIcon /> },
  { name: 'Solana', icon: <SolanaIcon /> },
];

const WALLETCONNECT_BLUE = '#3B99FC';

export function Networks({ t }: { t: Dict }) {
  return (
    <section aria-label={t.networks.label} className="border-y border-bone/10 bg-ink px-5 py-8 sm:px-8">
      <div className="mx-auto flex max-w-page flex-col items-center gap-6 sm:flex-row sm:justify-between">
        <Stagger as="ul" className="flex flex-wrap items-center justify-center gap-3" gap={0.06}>
          {CHAINS.map((c) => (
            <Item key={c.name} as="li" className="flex items-center gap-2 rounded-full border border-bone/10 bg-ink-2 py-1.5 pl-2 pr-3.5">
              <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-paper/95">
                {c.icon}
              </span>
              <span className="text-xs font-medium text-bone/90">{c.name}</span>
            </Item>
          ))}
        </Stagger>
        <Reveal
          className="flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium"
          delay={0.2}
          style={{ border: `1px solid ${WALLETCONNECT_BLUE}4d`, backgroundColor: `${WALLETCONNECT_BLUE}1a` }}
        >
          <WalletConnectIcon />
          <span style={{ color: WALLETCONNECT_BLUE }}>{t.networks.walletconnect}</span>
        </Reveal>
      </div>
    </section>
  );
}
