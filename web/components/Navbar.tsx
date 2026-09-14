'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Download, Menu, X } from 'lucide-react';

export function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed inset-x-0 top-0 z-50 bg-[#0B2B26]/75 backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-10">
        <Link href="/" className="flex items-center gap-2.5 text-white">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-sm font-black text-[#0B2B26]">K</span>
          <span className="text-xl font-black tracking-[-0.04em]">KALYX</span>
        </Link>
        <div className="hidden items-center gap-5 md:flex">
          <a href="#features" className="text-sm font-medium text-emerald-100/70 transition hover:text-white">Fonctionnalités</a>
          <Link href="/privacy" className="text-sm font-medium text-emerald-100/70 transition hover:text-white">Confidentialité</Link>
          <a href="#download" className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-[#0B2B26] transition hover:bg-lime-100">
            <Download className="h-4 w-4" /> Télécharger Kalyx
          </a>
        </div>
        <button onClick={() => setOpen(!open)} className="rounded-full p-2 text-white md:hidden" aria-label="Ouvrir le menu">
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>
      {open && (
        <div className="space-y-3 bg-[#0B2B26] px-5 pb-6 md:hidden">
          <a href="#features" onClick={() => setOpen(false)} className="block py-2 text-sm text-emerald-100/80">Fonctionnalités</a>
          <Link href="/privacy" onClick={() => setOpen(false)} className="block py-2 text-sm text-emerald-100/80">Confidentialité</Link>
          <a href="#download" onClick={() => setOpen(false)} className="flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-bold text-[#0B2B26]">
            <Download className="h-4 w-4" /> Télécharger Kalyx
          </a>
        </div>
      )}
    </nav>
  );
}
