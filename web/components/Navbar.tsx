'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Download, Menu, X } from 'lucide-react';
import { Mark } from './Mark';

const links = [
  { href: '/#features', label: 'Fonctionnalités' },
  { href: '/#security', label: 'Sécurité' },
  { href: '/privacy', label: 'Confidentialité' },
];

export function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed inset-x-0 top-0 z-50 border-b border-trait bg-encre/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-page items-center justify-between px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5 text-lueur">
          <Mark size={22} />
          <span className="text-lg font-semibold tracking-[-0.02em]">Kalyx</span>
        </Link>

        <div className="hidden items-center gap-7 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-brume transition-colors hover:text-lueur"
            >
              {l.label}
            </Link>
          ))}
          <a
            href="#download"
            className="inline-flex h-10 items-center gap-2 rounded-input bg-lumiere px-4 text-sm font-semibold text-encre transition-transform duration-150 active:scale-[0.96]"
          >
            <Download className="h-4 w-4" /> Télécharger
          </a>
        </div>

        <button
          onClick={() => setOpen(!open)}
          className="flex h-12 w-12 items-center justify-center rounded-input text-lueur md:hidden"
          aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
          aria-expanded={open}
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-trait bg-encre px-5 pb-5 pt-2 md:hidden">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block py-3 text-base font-medium text-brume"
            >
              {l.label}
            </Link>
          ))}
          <a
            href="#download"
            onClick={() => setOpen(false)}
            className="mt-3 flex h-14 items-center justify-center gap-2 rounded-button bg-lumiere text-base font-semibold text-encre"
          >
            <Download className="h-4 w-4" /> Télécharger Kalyx
          </a>
        </div>
      )}
    </nav>
  );
}
