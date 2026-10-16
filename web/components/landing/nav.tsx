'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Globe, Menu, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { EASE } from './motion';
import { Mark } from './mark';
import { LOCALES, LOCALE_NAMES, STORAGE_KEY, type Dict, type Locale } from '../../i18n';
import { APK_URL } from '../../lib/apk';
import { WEB_APP_URL } from '../../lib/links';
import { useReducedMotionSafe } from './reduced-motion';

/** Sélecteur de langue : mémorise le choix, puis ouvre la même page dans l'autre langue. */
function LanguageSwitcher({ lang, label, className = '' }: { lang: Locale; label: string; className?: string }) {
  const pathname = usePathname() ?? '/';
  const rest = pathname.replace(new RegExp(`^/${lang}(?=/|$)`), '') || '/';

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as Locale;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
    window.location.assign(`/${next}${rest}`);
  }

  return (
    <label className={`relative inline-flex h-8 items-center gap-1.5 rounded-full pl-2 pr-1 text-xs text-white/70 transition-colors hover:text-white ${className}`}>
      <Globe className="h-3.5 w-3.5" aria-hidden />
      <span className="sr-only">{label}</span>
      <select
        value={lang}
        onChange={onChange}
        aria-label={label}
        className="cursor-pointer appearance-none bg-transparent pr-4 text-xs text-inherit outline-none"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l} className="bg-[#1d1d1f] text-white">
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
      <span aria-hidden className="pointer-events-none absolute right-3 text-[10px]">▾</span>
    </label>
  );
}

export function Nav({ t, lang }: { t: Dict; lang: Locale }) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotionSafe();
  const links = [
    { href: `/${lang}/#fonctionnement`, label: t.nav.how },
    { href: `/${lang}/#voler`, label: t.nav.security },
    { href: `/${lang}/#copilote`, label: t.nav.ai },
    { href: `/${lang}/#frais`, label: t.nav.fees },
    { href: `/${lang}/#vision`, label: t.nav.vision },
  ];

  return (
    <motion.header
      initial={reduce ? false : { y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.9, ease: EASE }}
      className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-black/70 backdrop-blur-xl backdrop-saturate-150"
    >
      <div className="mx-auto max-w-page">
      <div className="flex h-12 items-center justify-between px-5 sm:px-8">
        <Link href={`/${lang}/`} className="flex items-center gap-2 text-white">
          <Mark size={18} className="text-[#E6C682]" />
          <span className="text-[15px] font-semibold tracking-[-0.01em]">Kalyx</span>
        </Link>

        <nav className="hidden items-center gap-7 lg:flex" aria-label={t.nav.chapters}>
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="whitespace-nowrap text-xs text-white/75 transition-colors hover:text-white">
              {l.label}
            </Link>
          ))}
          <LanguageSwitcher lang={lang} label={t.nav.language} />
          <a
            href={WEB_APP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="whitespace-nowrap text-xs text-white/75 transition-colors hover:text-white"
          >
            {t.nav.webApp}
          </a>
          <a
            href={APK_URL}
            download
            className="inline-flex h-7 items-center whitespace-nowrap rounded-full bg-[#F6EEE2] px-3.5 text-xs font-semibold text-[#0B0B10] transition-colors hover:bg-white"
          >
            {t.nav.downloadApk}
          </a>
        </nav>

        <div className="flex items-center gap-1 lg:hidden">
          <LanguageSwitcher lang={lang} label={t.nav.language} />
          <button
            onClick={() => setOpen(!open)}
            className="flex h-11 w-11 items-center justify-center text-white"
            aria-label={open ? t.nav.closeMenu : t.nav.openMenu}
            aria-expanded={open}
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-white/10 px-5 pb-6 pt-2 lg:hidden">
          {links.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="block border-b border-white/10 py-3.5 text-lg font-semibold text-white/85">
              {l.label}
            </Link>
          ))}
          <a
            href={WEB_APP_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="mt-5 flex h-12 items-center justify-center rounded-full bg-white/10 text-base font-medium text-white"
          >
            {t.nav.webApp}
          </a>
          <a
            href={APK_URL}
            download
            onClick={() => setOpen(false)}
            className="mt-3 flex h-12 items-center justify-center rounded-full bg-[#F6EEE2] text-base font-semibold text-[#0B0B10]"
          >
            {t.nav.downloadApk}
          </a>
        </div>
      )}
      </div>
    </motion.header>
  );
}
