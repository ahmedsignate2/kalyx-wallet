import React from 'react';
import { Reveal, Stagger, Item } from './motion';
import type { Dict } from '../../i18n';

/** Couleurs de marque approximatives, en badge ticker (pas de logo officiel reproduit). */
const CHAINS = [
  { symbol: 'AVAX', name: 'Avalanche', color: '#E84142' },
  { symbol: 'SEI', name: 'Sei', color: '#9E1030' },
  { symbol: 'BTC', name: 'Bitcoin', color: '#F7931A' },
  { symbol: 'SOL', name: 'Solana', color: '#9945FF' },
];

const WALLETCONNECT_BLUE = '#3B99FC';

export function Networks({ t }: { t: Dict }) {
  return (
    <section aria-label={t.networks.label} className="border-y border-bone/10 bg-ink px-5 py-8 sm:px-8">
      <div className="mx-auto flex max-w-page flex-col items-center gap-6 sm:flex-row sm:justify-between">
        <Stagger as="ul" className="flex flex-wrap items-center justify-center gap-3" gap={0.06}>
          {CHAINS.map((c) => (
            <Item key={c.symbol} as="li" className="flex items-center gap-2 rounded-full border border-bone/10 bg-ink-2 py-1.5 pl-1.5 pr-3.5">
              <span
                aria-hidden
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-ink"
                style={{ backgroundColor: c.color }}
              >
                {c.symbol.slice(0, 1)}
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
          <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: WALLETCONNECT_BLUE }} />
          <span style={{ color: WALLETCONNECT_BLUE }}>{t.networks.walletconnect}</span>
        </Reveal>
      </div>
    </section>
  );
}
