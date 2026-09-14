'use client';

import React from 'react';
import { 
  ShieldAlert, 
  Lock, 
  EyeOff, 
  Cpu, 
  Fingerprint, 
  Terminal, 
  LifeBuoy, 
  FileCheck2 
} from 'lucide-react';

export function SecuritySection() {
  const securityPillars = [
    {
      icon: Lock,
      title: 'Enclave Matérielle & AES-256-GCM',
      description:
        'Votre phrase de récupération de 12 ou 24 mots est chiffrée localement avec AES-256-GCM. La clé est protégée au niveau matériel par le Secure Enclave (iOS) et Android Keystore.',
      badge: 'Chiffrement Matériel',
    },
    {
      icon: EyeOff,
      title: 'Zéro Traçage & Zéro Données',
      description:
        'Aucun compte à créer, aucun e-mail exigé, aucun identifiant publicitaire. Kalyx Wallet n’embarque aucun SDK de pistage et ne journalise jamais votre adresse IP.',
      badge: 'Vie Privée Absolue',
    },
    {
      icon: Fingerprint,
      title: 'Authentification Biométrique & PIN',
      description:
        'Face ID, Touch ID et code PIN à dérivations multiples. Un écran de garde automatique et une protection anti brute-force bloquent toute tentative d\'intrusion physique.',
      badge: 'Biométrie Sécurisée',
    },
    {
      icon: ShieldAlert,
      title: 'Simulation Pré-Signature (Anti-Drainer)',
      description:
        'Avant de signer un contrat malveillant, le simulateur GoPlus et Helius analyse le code du smart contract et prévient immédiatement en cas de honeypot ou de drainer.',
      badge: 'Prévention Active',
    },
    {
      icon: Terminal,
      title: 'Export Diagnostic Anonymisé',
      description:
        'En cas d’incident, générez un rapport technique horodaté (système de tickets KX-...) avec masquage automatique des clés d’API privées et zéro donnée confidentielle.',
      badge: 'Support Éthique',
    },
    {
      icon: FileCheck2,
      title: 'Conformité LCEN & RGPD',
      description:
        'Structure juridique transparente enregistrée en France sous statut d\'entrepreneur individuel. Respect strict du RGPD européen et des exigences Google Play & App Store.',
      badge: 'Conformité Européenne',
    },
  ];

  return (
    <section id="security" className="py-24 relative bg-surface/40 border-y border-border/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 sm:mb-20">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-panel border-primary/30 text-xs font-semibold text-primary-light mb-4">
            <Lock className="w-3.5 h-3.5" />
            <span>Architecture Zéro Compromis</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight leading-tight">
            La sécurité au niveau d&apos;un coffre-fort suisse.
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-400">
            Dans la finance décentralisée, une erreur ne pardonne pas. Kalyx intègre les meilleures barrières de défense du marché mobile.
          </p>
        </div>

        {/* Security Pillars Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {securityPillars.map((pillar, idx) => {
            const Icon = pillar.icon;
            return (
              <div
                key={idx}
                className="rounded-3xl glass-panel p-7 relative group hover:border-primary/40 hover:-translate-y-1 transition-all duration-300"
              >
                <div className="flex items-center justify-between mb-5">
                  <div className="w-12 h-12 rounded-2xl bg-surface-hover text-white group-hover:text-cyan flex items-center justify-center border border-border group-hover:border-cyan/40 transition-colors">
                    <Icon className="w-6 h-6" />
                  </div>
                  <span className="text-[11px] font-semibold tracking-wide uppercase px-2.5 py-1 rounded-full bg-surface text-slate-300 border border-border">
                    {pillar.badge}
                  </span>
                </div>

                <h3 className="text-lg font-bold text-white mb-2.5">
                  {pillar.title}
                </h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  {pillar.description}
                </p>
              </div>
            );
          })}
        </div>

        {/* Big Assurance Callout */}
        <div className="mt-16 rounded-3xl p-8 sm:p-10 bg-gradient-to-r from-primary/20 via-surface to-cyan/10 border border-primary/30 relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="space-y-2 text-center md:text-left">
            <h4 className="text-2xl font-bold text-white">
              Prêt à reprendre le pouvoir sur vos finances ?
            </h4>
            <p className="text-slate-300 text-sm max-w-xl">
              Téléchargez l’APK Android ou rejoignez la communauté Telegram pour suivre le déploiement sur les stores officiels.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <a
              href="https://t.me/kalyxntw"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl glass-panel text-white hover:bg-surface-hover font-semibold text-sm transition-colors"
            >
              <LifeBuoy className="w-4 h-4 text-cyan" />
              <span>Canal Telegram</span>
            </a>
            <a
              href="#download"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-primary to-cyan text-white font-semibold text-sm shadow-lg shadow-primary/30 hover:opacity-95 transition-opacity"
            >
              <span>Obtenir Kalyx</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
