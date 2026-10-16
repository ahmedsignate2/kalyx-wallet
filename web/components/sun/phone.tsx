import React from 'react';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, EyeOff, Plus } from 'lucide-react';
import { Landscape } from './landscape';
import { Mark } from '../landing/mark';
import { BitcoinIcon, SolanaIcon, TonIcon } from '../landing/networks';

/** Logo Ethereum (simple-icons, CC0). */
function EthereumIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden fill="#627EEA">
      <path d="M11.944 17.97 4.58 13.62 11.943 24l7.37-10.38-7.372 4.35h.003zM12.056 0 4.69 12.223l7.365 4.354 7.365-4.35L12.056 0z" />
    </svg>
  );
}

const TOKENS = [
  { name: 'Bitcoin', sym: 'BTC', icon: <BitcoinIcon size={20} /> },
  { name: 'Ethereum', sym: 'ETH', icon: <EthereumIcon size={20} /> },
  { name: 'Solana', sym: 'SOL', icon: <SolanaIcon size={18} /> },
  { name: 'Toncoin', sym: 'TON', icon: <TonIcon size={19} /> },
];

const TILES = [
  { bg: 'bg-tint-send', ink: 'text-tint-sendInk', Icon: ArrowUpRight },
  { bg: 'bg-tint-receive', ink: 'text-tint-receiveInk', Icon: ArrowDownLeft },
  { bg: 'bg-tint-swap', ink: 'text-tint-swapInk', Icon: ArrowLeftRight },
  { bg: 'bg-tint-buy', ink: 'text-tint-buyInk', Icon: Plus },
];

/**
 * L'accueil de l'app, dessiné en HTML — sans aucun chiffre inventé : les soldes
 * sont masqués (••••), exactement comme le mode « Masquer les soldes » de l'app.
 */
export function Phone({ className = '' }: { className?: string }) {
  return (
    <div className={`relative w-[290px] shrink-0 rounded-[3rem] bg-[#16130F] p-[10px] shadow-phone ring-1 ring-black/10 sm:w-[320px] ${className}`}>
      <div className="relative overflow-hidden rounded-[2.4rem] bg-ink">
        {/* En-tête paysage, solde masqué. */}
        <div className="relative h-[300px] sm:h-[330px]">
          <Landscape id="phone" phase="dusk" sunAt={0.32} veil />
          <div className="absolute left-1/2 top-2.5 h-6 w-24 -translate-x-1/2 rounded-full bg-black" />
          <div className="relative flex items-center justify-between px-5 pt-12 text-white">
            <span className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 backdrop-blur">
                <Mark size={16} className="text-[#F1CF8A]" />
              </span>
              <span className="h-2 w-16 rounded-full bg-white/35" />
            </span>
            <EyeOff className="h-4 w-4 opacity-80" aria-hidden />
          </div>
          <div className="relative px-5 pt-7 text-white">
            <span className="block h-2 w-20 rounded-full bg-white/40" />
            <p className="shimmer mt-3 text-[2.6rem] font-semibold leading-none tracking-[-0.02em]" aria-hidden>
              •••• <span className="text-2xl">€</span>
            </p>
          </div>
        </div>
        {/* Tuiles d'action teintées, comme l'app. */}
        <div className="relative -mt-8 grid grid-cols-4 gap-2.5 px-4">
          {TILES.map(({ bg, ink, Icon }, i) => (
            <div key={i} className={`tile-pop flex aspect-square items-center justify-center rounded-2xl ${bg} shadow-card ring-1 ring-white/60`} style={{ animationDelay: `${2.3 + i * 0.09}s` }}>
              <Icon className={`h-5 w-5 ${ink}`} strokeWidth={2.2} aria-hidden />
            </div>
          ))}
        </div>
        <ul className="mx-4 mb-5 mt-4 divide-y divide-cream-line rounded-3xl bg-ink-2 px-4 shadow-card">
          {TOKENS.map((tk, i) => (
            <li key={tk.sym} className="row-in flex items-center gap-3 py-3" style={{ animationDelay: `${2.6 + i * 0.1}s` }}>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-3">{tk.icon}</span>
              <span className="flex-1">
                <span className="block text-sm font-semibold text-paper">{tk.name}</span>
                <span className="block text-xs text-mist">{tk.sym}</span>
              </span>
              <span className="text-sm font-semibold tracking-widest text-paper" aria-hidden>••••</span>
            </li>
          ))}
        </ul>
        <span className="absolute bottom-1.5 left-1/2 h-1 w-28 -translate-x-1/2 rounded-full bg-paper/25" />
      </div>
    </div>
  );
}
