'use client';

import React from 'react';
import { 
  ShieldCheck, 
  Layers, 
  ArrowLeftRight, 
  Globe, 
  Cpu, 
  Zap, 
  Flame, 
  KeyRound, 
  Activity,
  Check
} from 'lucide-react';

export function BentoGrid() {
  return (
    <section id="features" className="py-24 relative bg-background">
      {/* Background ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[140px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 sm:mb-20">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-panel border-cyan/30 text-xs font-semibold text-cyan mb-4">
            <Zap className="w-3.5 h-3.5" />
            <span>Technologies de pointe</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight leading-tight">
            Tout ce dont vous avez besoin pour dominer le Web3.
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-400">
            Une interface épurée, une rapidité fulgurante et des protocoles de sécurité impénétrables réunis dans une seule application.
          </p>
        </div>

        {/* Bento Grid layout */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {/* Card 1: 100% Non-Custodial (Large 2 cols) */}
          <div className="md:col-span-2 rounded-3xl glass-panel p-8 relative overflow-hidden group hover:border-primary/50 transition-all duration-300">
            <div className="absolute -right-8 -bottom-8 w-48 h-48 bg-primary/20 rounded-full blur-3xl group-hover:bg-primary/30 transition-all" />
            
            <div className="w-12 h-12 rounded-2xl bg-primary/20 text-primary-light flex items-center justify-center mb-6 border border-primary/30">
              <KeyRound className="w-6 h-6" />
            </div>

            <h3 className="text-2xl font-bold text-white mb-3">
              100% Non-Custodial & Souverain
            </h3>
            <p className="text-slate-300 leading-relaxed mb-6">
              Vos clés privées sont générées et conservées exclusivement dans la zone sécurisée matérielle de votre smartphone. Ni Kalyx, ni aucun serveur distant ne peut accéder à vos fonds. Vous êtes le seul maître à bord.
            </p>

            <div className="grid grid-cols-2 gap-3 pt-2 text-xs font-medium text-slate-300">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Check className="w-3 h-3" />
                </div>
                <span>Chiffrement AES-256-GCM</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Check className="w-3 h-3" />
                </div>
                <span>Zero télémétrie ni IP logging</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Check className="w-3 h-3" />
                </div>
                <span>Stockage matériel sécurisé</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Check className="w-3 h-3" />
                </div>
                <span>Protection anti brute-force</span>
              </div>
            </div>
          </div>

          {/* Card 2: Multi-Chain Powerhouse (Large 2 cols or 1 col) */}
          <div id="chains" className="md:col-span-1 lg:col-span-2 rounded-3xl glass-panel p-8 relative overflow-hidden group hover:border-cyan/50 transition-all duration-300">
            <div className="absolute -right-8 -bottom-8 w-48 h-48 bg-cyan/20 rounded-full blur-3xl group-hover:bg-cyan/30 transition-all" />

            <div className="w-12 h-12 rounded-2xl bg-cyan/20 text-cyan flex items-center justify-center mb-6 border border-cyan/30">
              <Layers className="w-6 h-6" />
            </div>

            <h3 className="text-2xl font-bold text-white mb-3">
              Multi-Chaînes Universel
            </h3>
            <p className="text-slate-300 leading-relaxed mb-6">
              Gérez simultanément vos actifs EVM, Solana et Bitcoin depuis un portefeuille unifié sans bascule complexe.
            </p>

            <div className="flex flex-wrap gap-2 pt-1">
              {['Ethereum', 'Solana', 'Bitcoin', 'Polygon', 'Arbitrum', 'Optimism', 'Base', 'BNB Chain'].map((chain) => (
                <span 
                  key={chain}
                  className="px-3 py-1.5 rounded-xl bg-surface-hover/80 border border-border text-xs font-semibold text-slate-200"
                >
                  {chain}
                </span>
              ))}
            </div>
          </div>

          {/* Card 3: Anti-Drainer & Simulation */}
          <div className="md:col-span-1 lg:col-span-2 rounded-3xl glass-panel p-8 relative overflow-hidden group hover:border-emerald/50 transition-all duration-300">
            <div className="w-12 h-12 rounded-2xl bg-emerald/20 text-emerald flex items-center justify-center mb-6 border border-emerald/30">
              <ShieldCheck className="w-6 h-6" />
            </div>

            <h3 className="text-2xl font-bold text-white mb-3">
              Bouclier Anti-Drainer Actif
            </h3>
            <p className="text-slate-300 leading-relaxed mb-4">
              Chaque transaction et approbation de contrat est pré-simulée via GoPlus Security et Helius avant votre validation biométrique. Détecte instantanément les pièges de type honeypot, drainer ou adresses sanctionnées.
            </p>

            <div className="p-4 rounded-2xl bg-surface-card border border-emerald-500/20 flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-mono text-emerald-300">
                Simulation active : 0 transaction compromise
              </span>
            </div>
          </div>

          {/* Card 4: Agrégateur Swap & Bridge LI.FI */}
          <div className="md:col-span-1 lg:col-span-1 rounded-3xl glass-panel p-8 relative overflow-hidden group hover:border-primary/50 transition-all duration-300">
            <div className="w-12 h-12 rounded-2xl bg-primary/20 text-primary-light flex items-center justify-center mb-6 border border-primary/30">
              <ArrowLeftRight className="w-6 h-6" />
            </div>

            <h3 className="text-xl font-bold text-white mb-2">
              Swap & Bridge LI.FI
            </h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Agrégation de liquidités sur plus de 20 DEX pour obtenir le meilleur taux sans frais cachés.
            </p>
          </div>

          {/* Card 5: Speed up / Cancel EVM Mempool */}
          <div className="md:col-span-1 lg:col-span-1 rounded-3xl glass-panel p-8 relative overflow-hidden group hover:border-cyan/50 transition-all duration-300">
            <div className="w-12 h-12 rounded-2xl bg-cyan/20 text-cyan flex items-center justify-center mb-6 border border-cyan/30">
              <Activity className="w-6 h-6" />
            </div>

            <h3 className="text-xl font-bold text-white mb-2">
              Mempool Speed Up
            </h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Accélérez ou annulez en un clic vos transactions EVM bloquées grâce au remplacement de nonce dynamique.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
