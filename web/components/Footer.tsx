'use client';

import React from 'react';
import Link from 'next/link';
import { Mail, MessageCircle, Twitter, ShieldCheck, Heart } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t border-border bg-background pt-16 pb-12 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 pb-12 border-b border-border/60">
          {/* Brand col */}
          <div className="lg:col-span-2 space-y-4">
            <Link href="/" className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-primary to-cyan flex items-center justify-center p-0.5 shadow-md shadow-primary/20">
                <div className="w-full h-full bg-surface rounded-[10px] flex items-center justify-center">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    className="w-5 h-5 text-white"
                  >
                    <path
                      d="M12 2L2 7L12 12L22 7L12 2Z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M2 17L12 22L22 17"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M2 12L12 17L22 12"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </div>
              <span className="text-xl font-bold tracking-tight text-white">
                KALYX <span className="text-primary-light font-normal">Wallet</span>
              </span>
            </Link>

            <p className="text-slate-400 text-sm leading-relaxed max-w-sm">
              Portefeuille Web3 non-custodial multi-chaînes nouvelle génération. Souveraineté totale, sécurité cryptographique matérielle et transactions instantanées.
            </p>

            <div className="flex items-center gap-3 pt-2">
              <a
                href="https://t.me/kalyxntw"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Telegram"
                className="w-9 h-9 rounded-xl glass-panel flex items-center justify-center text-slate-300 hover:text-cyan hover:border-cyan/40 transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
              </a>
              <a
                href="https://x.com/kalyxntw"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Twitter X"
                className="w-9 h-9 rounded-xl glass-panel flex items-center justify-center text-slate-300 hover:text-primary-light hover:border-primary/40 transition-colors"
              >
                <Twitter className="w-4 h-4" />
              </a>
              <a
                href="mailto:support@kalyxwallet.com"
                aria-label="Email Support"
                className="w-9 h-9 rounded-xl glass-panel flex items-center justify-center text-slate-300 hover:text-emerald-400 hover:border-emerald/40 transition-colors"
              >
                <Mail className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Navigation Links */}
          <details className="border-b border-white/10 pb-4 lg:border-0 lg:pb-0" open>
            <summary className="cursor-pointer list-none text-xs font-bold uppercase tracking-wider text-slate-200 lg:mb-4">Produit</summary>
            <ul className="mt-4 space-y-2.5 text-sm lg:mt-0">
              <li>
                <a href="#features" className="text-slate-400 hover:text-white transition-colors">
                  Fonctionnalités
                </a>
              </li>
              <li>
                <a href="#security" className="text-slate-400 hover:text-white transition-colors">
                  Sécurité
                </a>
              </li>
              <li>
                <a href="#chains" className="text-slate-400 hover:text-white transition-colors">
                  Multi-chaînes
                </a>
              </li>
              <li>
                <a href="#download" className="text-slate-400 hover:text-white transition-colors">
                  Téléchargement APK
                </a>
              </li>
            </ul>
          </details>

          {/* Legal Links */}
          <details className="border-b border-white/10 pb-4 lg:border-0 lg:pb-0">
            <summary className="cursor-pointer list-none text-xs font-bold uppercase tracking-wider text-slate-200 lg:mb-4">Légal &amp; Conformité</summary>
            <ul className="mt-4 space-y-2.5 text-sm lg:mt-0">
              <li>
                <Link href="/privacy" className="text-slate-400 hover:text-white transition-colors">
                  Politique de Confidentialité
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-slate-400 hover:text-white transition-colors">
                  Conditions Générales d&apos;Utilisation
                </Link>
              </li>
              <li>
                <Link href="/privacy#hosting" className="text-slate-400 hover:text-white transition-colors">
                  Mentions Légales LCEN
                </Link>
              </li>
            </ul>
          </details>

          {/* Support */}
          <details className="border-b border-white/10 pb-4 lg:border-0 lg:pb-0">
            <summary className="cursor-pointer list-none text-xs font-bold uppercase tracking-wider text-slate-200 lg:mb-4">Assistance</summary>
            <ul className="mt-4 space-y-2.5 text-sm lg:mt-0">
              <li>
                <a 
                  href="mailto:support@kalyxwallet.com"
                  className="text-slate-400 hover:text-white transition-colors flex items-center gap-1.5"
                >
                  <Mail className="w-3.5 h-3.5 text-cyan" />
                  <span>support@kalyxwallet.com</span>
                </a>
              </li>
              <li>
                <a
                  href="https://t.me/kalyxntw"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-400 hover:text-white transition-colors flex items-center gap-1.5"
                >
                  <MessageCircle className="w-3.5 h-3.5 text-cyan" />
                  <span>Support Telegram</span>
                </a>
              </li>
              <li className="pt-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-medium text-emerald-400">
                  <ShieldCheck className="w-3 h-3" />
                  <span>Système KX actif</span>
                </span>
              </li>
            </ul>
          </details>
        </div>

        {/* Legal Mentions LCEN Bar */}
        <div className="pt-8 text-xs text-slate-500 space-y-2">
          <p>
            <strong className="text-slate-400 font-semibold">Éditeur :</strong> KALYX (Entreprise individuelle de Ahamed Signate) • SIRET : En cours d&apos;attribution INSEE • Contact : support@kalyxwallet.com
          </p>
          <p>
            <strong className="text-slate-400 font-semibold">Hébergement & Exécution :</strong> Application mobile non-custodial exécutée exclusivement en local sur l&apos;appareil de l&apos;utilisateur, sans serveur de détention de clés.
          </p>
          <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-slate-500">
            <p>© 2026 KALYX Wallet. Tous droits réservés.</p>
            <p className="flex items-center gap-1">
              Conçu pour l&apos;auto-souveraineté financière
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
