'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { EASE } from './motion';
import { Mark } from './mark';

const links = [
  { href: '/#fonctionnalites', label: 'Fonctionnalités' },
  { href: '/#securite', label: 'Sécurité' },
  { href: '/privacy', label: 'Confidentialité' },
];

export function Nav() {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();

  return (
    <motion.header
      initial={reduce ? false : { y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.9, ease: EASE }}
      className="fixed inset-x-0 top-0 z-50 border-b border-bone/10 bg-ink/70 backdrop-blur-xl"
    >
      <div className="mx-auto flex h-16 max-w-page items-center justify-between px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5 text-paper">
          <Mark size={22} className="text-sage" />
          <span className="font-display text-xl tracking-tight">Kalyx</span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Principale">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="text-sm text-mist transition-colors hover:text-paper">
              {l.label}
            </Link>
          ))}
          <a
            href="/kalyx-wallet.apk"
            download
            className="inline-flex h-10 items-center rounded-full bg-paper px-5 text-sm font-medium text-ink transition-colors hover:bg-bone"
          >
            Télécharger l’APK
          </a>
        </nav>

        <button
          onClick={() => setOpen(!open)}
          className="flex h-12 w-12 items-center justify-center text-paper md:hidden"
          aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
          aria-expanded={open}
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-bone/10 bg-ink px-5 pb-6 pt-2 md:hidden">
          {links.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="block py-3 text-base text-mist">
              {l.label}
            </Link>
          ))}
          <a
            href="/kalyx-wallet.apk"
            download
            onClick={() => setOpen(false)}
            className="mt-3 flex h-12 items-center justify-center rounded-full bg-paper text-base font-medium text-ink"
          >
            Télécharger l’APK
          </a>
        </div>
      )}
    </motion.header>
  );
}
