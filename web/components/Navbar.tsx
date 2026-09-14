'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Menu, X, ArrowRight, ShieldCheck, Download } from 'lucide-react';

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Brand Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-primary to-cyan flex items-center justify-center p-0.5 shadow-lg shadow-primary/20 group-hover:scale-105 transition-transform duration-300">
              <div className="w-full h-full bg-surface rounded-[10px] flex items-center justify-center">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="w-6 h-6 text-white group-hover:text-cyan transition-colors"
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
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-white group-hover:text-slate-200 transition-colors">
                KALYX
              </span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/20 text-primary-light border border-primary/30">
                Wallet
              </span>
            </div>
          </Link>

          {/* Desktop Nav Links */}
          <div className="hidden md:flex items-center gap-8">
            <a
              href="#features"
              className="text-sm font-medium text-slate-300 hover:text-white transition-colors"
            >
              Fonctionnalités
            </a>
            <a
              href="#security"
              className="text-sm font-medium text-slate-300 hover:text-white transition-colors"
            >
              Sécurité
            </a>
            <a
              href="#chains"
              className="text-sm font-medium text-slate-300 hover:text-white transition-colors"
            >
              Multi-chaînes
            </a>
            <Link
              href="/privacy"
              className="text-sm font-medium text-slate-300 hover:text-white transition-colors"
            >
              Confidentialité
            </Link>
            <Link
              href="/terms"
              className="text-sm font-medium text-slate-300 hover:text-white transition-colors"
            >
              CGU
            </Link>
          </div>

          {/* Action Button */}
          <div className="hidden md:flex items-center gap-4">
            <a
              href="#download"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary to-cyan text-white font-semibold text-sm shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:opacity-95 transition-all duration-200"
            >
              <Download className="w-4 h-4" />
              <span>Télécharger</span>
            </a>
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden flex items-center">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-surface focus:outline-none"
              aria-label="Menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-border bg-surface/95 backdrop-blur-2xl px-6 pt-4 pb-6 space-y-3">
          <a
            href="#features"
            onClick={() => setMobileMenuOpen(false)}
            className="block text-base font-medium text-slate-200 hover:text-white py-2"
          >
            Fonctionnalités
          </a>
          <a
            href="#security"
            onClick={() => setMobileMenuOpen(false)}
            className="block text-base font-medium text-slate-200 hover:text-white py-2"
          >
            Sécurité
          </a>
          <a
            href="#chains"
            onClick={() => setMobileMenuOpen(false)}
            className="block text-base font-medium text-slate-200 hover:text-white py-2"
          >
            Multi-chaînes
          </a>
          <Link
            href="/privacy"
            onClick={() => setMobileMenuOpen(false)}
            className="block text-base font-medium text-slate-200 hover:text-white py-2"
          >
            Politique de confidentialité
          </Link>
          <Link
            href="/terms"
            onClick={() => setMobileMenuOpen(false)}
            className="block text-base font-medium text-slate-200 hover:text-white py-2"
          >
            Conditions Générales d&apos;Utilisation
          </Link>
          <div className="pt-3">
            <a
              href="#download"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-primary to-cyan text-white font-semibold text-sm shadow-lg shadow-primary/25"
            >
              <Download className="w-4 h-4" />
              <span>Télécharger l&apos;application</span>
            </a>
          </div>
        </div>
      )}
    </nav>
  );
}
