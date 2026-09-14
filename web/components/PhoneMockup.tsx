'use client';

import React from 'react';
import { ArrowUpRight, ArrowDownLeft, RefreshCw, ShoppingCart, ShieldCheck, Zap, Sparkles } from 'lucide-react';

export function PhoneMockup() {
  return (
    <div className="relative mx-auto w-[290px] max-w-full select-none perspective-[1200px] sm:w-[390px] lg:w-[440px]">
      {/* Background Ambient Glow */}
      <div className="absolute -inset-4 bg-gradient-to-tr from-primary/30 via-cyan/20 to-emerald/20 rounded-[50px] blur-3xl opacity-75 animate-pulse-slow -z-10" />

      {/* Floating Badges */}
      <div className="absolute -left-16 top-10 z-20 hidden items-center gap-2.5 rounded-2xl glass-panel px-4 py-2.5 shadow-2xl sm:flex animate-float-slow">
        <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div>
          <div className="text-xs font-bold text-white">100% Non-Custodial</div>
          <div className="text-[10px] text-slate-400">Vos clés sur votre appareil</div>
        </div>
      </div>

      <div className="absolute -right-14 bottom-14 z-20 hidden items-center gap-2.5 rounded-2xl glass-panel px-4 py-2.5 shadow-2xl sm:flex animate-float-slow [animation-delay:2s]">
        <div className="w-8 h-8 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
          <Zap className="w-5 h-5" />
        </div>
        <div>
          <div className="text-xs font-bold text-white">Multi-Chaînes</div>
          <div className="text-[10px] text-slate-400">ETH · SOL · BTC · L2s</div>
        </div>
      </div>

      {/* Outer Phone Frame */}
      <div className="relative rotate-[4deg] rounded-[44px] p-3.5 bg-gradient-to-b from-slate-600/70 via-slate-800/60 to-slate-950 shadow-[25px_35px_70px_-15px_rgba(0,0,0,0.9),0_0_50px_rgba(124,58,237,0.18)] border border-white/20 backdrop-blur-2xl transition-transform duration-500 hover:rotate-0">
        {/* Inner Screen */}
        <div className="relative rounded-[36px] overflow-hidden bg-[#07090E] border border-white/5 p-5 text-slate-100 flex flex-col gap-4">
          {/* Status Bar / Dynamic Island */}
          <div className="flex items-center justify-between pt-1 px-1 text-xs text-slate-400">
            <span className="font-semibold text-slate-200">09:41</span>
            <div className="w-20 h-4 bg-black/60 rounded-full border border-white/10 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-cyan-400/80" />
            </div>
            <div className="flex items-center gap-1.5 font-medium">
              <span>5G</span>
              <div className="w-5 h-2.5 border border-slate-400 rounded-sm p-0.5">
                <div className="w-full h-full bg-slate-200 rounded-xs" />
              </div>
            </div>
          </div>

          {/* App Header */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary/20 border border-primary/40 flex items-center justify-center text-primary-light font-bold text-xs">
                KX
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-300">Portefeuille Principal</div>
                <div className="text-[10px] text-emerald-400 flex items-center gap-1 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Connecté (Multi-chain)
                </div>
              </div>
            </div>
            <div className="w-7 h-7 rounded-lg bg-surface flex items-center justify-center border border-border">
              <Sparkles className="w-3.5 h-3.5 text-primary-light" />
            </div>
          </div>

          {/* Balance Card */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-surface to-surface-card border border-white/10 shadow-inner flex flex-col items-center gap-1.5">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
              Solde Total
            </span>
            <div className="text-3xl font-extrabold tracking-tight text-white glow-text">
              $24,850.42
            </div>
            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-semibold">
              <span>+$1,348.10 (+5.73%)</span>
            </div>
          </div>

          {/* Quick Actions (Send, Receive, Swap, Buy) */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Envoyer', icon: ArrowUpRight, bg: 'bg-primary/20 text-primary-light' },
              { label: 'Recevoir', icon: ArrowDownLeft, bg: 'bg-cyan/20 text-cyan-400' },
              { label: 'Swap', icon: RefreshCw, bg: 'bg-emerald/20 text-emerald-400' },
              { label: 'Acheter', icon: ShoppingCart, bg: 'bg-slate-800 text-slate-200' },
            ].map((action, i) => (
              <div
                key={i}
                className="flex flex-col items-center gap-1 p-2 rounded-xl bg-surface/80 border border-border/70 hover:border-primary/40 transition-colors"
              >
                <div className={`w-9 h-9 rounded-xl ${action.bg} flex items-center justify-center shadow-sm`}>
                  <action.icon className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-medium text-slate-300">{action.label}</span>
              </div>
            ))}
          </div>

          {/* Assets List */}
          <div className="flex flex-col gap-2 pt-1">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-400 px-1">
              <span>Vos Actifs</span>
              <span className="text-primary-light hover:underline cursor-pointer">Voir tout</span>
            </div>

            {[
              {
                symbol: 'ETH',
                name: 'Ethereum',
                balance: '4.82 ETH',
                value: '$16,147.00',
                change: '+3.4%',
                icon: '⟠',
                color: 'from-blue-500/30 to-indigo-500/30 text-blue-300',
              },
              {
                symbol: 'SOL',
                name: 'Solana',
                balance: '35.4 SOL',
                value: '$5,210.88',
                change: '+8.1%',
                icon: '◎',
                color: 'from-purple-500/30 to-cyan-500/30 text-purple-300',
              },
              {
                symbol: 'BTC',
                name: 'Bitcoin',
                balance: '0.052 BTC',
                value: '$3,492.54',
                change: '+1.9%',
                icon: '₿',
                color: 'from-amber-500/30 to-orange-500/30 text-amber-300',
              },
            ].map((token, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-2.5 rounded-xl bg-surface/60 border border-white/5 hover:border-white/10 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-xl bg-gradient-to-tr ${token.color} flex items-center justify-center font-bold text-sm border border-white/10`}>
                    {token.icon}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-200">{token.name}</div>
                    <div className="text-[10px] text-slate-400">{token.balance}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold text-slate-100">{token.value}</div>
                  <div className="text-[10px] font-semibold text-emerald-400">{token.change}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Security Banner Micro */}
          <div className="mt-1 px-3 py-2 rounded-xl bg-primary/10 border border-primary/20 flex items-center gap-2 text-[10px] text-primary-light">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            <span className="font-medium">Chiffrement matériel AES-256 actif</span>
          </div>
        </div>
      </div>
    </div>
  );
}
