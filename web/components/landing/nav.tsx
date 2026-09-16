'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Globe, Menu, X } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { EASE } from './motion';
import { Mark } from './mark';
import { LOCALES, LOCALE_NAMES, STORAGE_KEY, type Dict, type Locale } from '../../i18n';
import { APK_URL } from '../../lib/apk';

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
    <label className={`relative inline-flex h-10 items-center gap-2 rounded-full border border-bone/15 pl-3 pr-2 text-sm text-mist transition-colors hover:border-bone/40 hover:text-paper ${className}`}>
      <Globe className="h-4 w-4" aria-hidden />
      <span className="sr-only">{label}</span>
      <select
        value={lang}
        onChange={onChange}
        aria-label={label}
        className="cursor-pointer appearance-none bg-transparent pr-4 text-sm text-inherit outline-none"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l} className="bg-ink-2 text-paper">
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
  const reduce = useReducedMotion();
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
      className="fixed inset-x-0 top-0 z-50 border-b border-bone/10 bg-ink/70 backdrop-blur-xl"
    >
      <div className="mx-auto flex h-16 max-w-page items-center justify-between px-5 sm:px-8">
        <Link href={`/${lang}/`} className="flex items-center gap-2.5 text-paper">
          <Mark size={22} className="text-sage" />
          <span className="font-display text-xl tracking-tight">Kalyx</span>
        </Link>

        <nav className="hidden items-center gap-6 xl:flex" aria-label={t.nav.chapters}>
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="whitespace-nowrap text-sm text-mist transition-colors hover:text-paper">
              {l.label}
            </Link>
          ))}
          <LanguageSwitcher lang={lang} label={t.nav.language} />
          <a
            href={APK_URL}
            download
            className="inline-flex h-10 items-center whitespace-nowrap rounded-full bg-paper px-5 text-sm font-medium text-ink transition-colors hover:bg-bone"
          >
            {t.nav.downloadApk}
          </a>
        </nav>

        <div className="flex items-center gap-1 xl:hidden">
          <LanguageSwitcher lang={lang} label={t.nav.language} />
          <button
            onClick={() => setOpen(!open)}
            className="flex h-12 w-12 items-center justify-center text-paper"
            aria-label={open ? t.nav.closeMenu : t.nav.openMenu}
            aria-expanded={open}
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-bone/10 bg-ink px-5 pb-6 pt-2 xl:hidden">
          {links.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="block py-3 text-base text-mist">
              {l.label}
            </Link>
          ))}
          <a
            href={APK_URL}
            download
            onClick={() => setOpen(false)}
            className="mt-3 flex h-12 items-center justify-center rounded-full bg-paper text-base font-medium text-ink"
          >
            {t.nav.downloadApk}
          </a>
        </div>
      )}
    </motion.header>
  );
}
