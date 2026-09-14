import React from 'react';
import Link from 'next/link';
import { Mark } from './mark';
import type { Dict, Locale } from '../../i18n';

export function Footer({ t, lang }: { t: Dict; lang: Locale }) {
  const columns = [
    {
      title: t.footer.product,
      links: [
        { href: `/${lang}/#fonctionnement`, label: t.nav.how },
        { href: `/${lang}/#voler`, label: t.nav.security },
        { href: `/${lang}/#frais`, label: t.nav.fees },
        { href: `/${lang}/#telecharger`, label: t.nav.downloadApk },
      ],
    },
    {
      title: t.footer.legal,
      links: [
        { href: `/${lang}/privacy/`, label: t.footer.privacy },
        { href: `/${lang}/terms/`, label: t.footer.terms },
        { href: `/${lang}/privacy/#hosting`, label: t.footer.mentions },
      ],
    },
    {
      title: t.footer.contact,
      links: [
        { href: 'mailto:support@kalyxwallet.com', label: 'support@kalyxwallet.com' },
        { href: 'https://t.me/kalyxntw', label: 'Telegram', external: true },
        { href: 'https://x.com/kalyxntw', label: 'X (Twitter)', external: true },
      ],
    },
  ];

  return (
    <footer className="border-t border-bone/10 bg-ink-2 px-5 pb-10 pt-16 sm:px-8">
      <div className="mx-auto max-w-page">
        <div className="grid grid-cols-1 gap-10 border-b border-bone/10 pb-12 md:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-5 lg:col-span-2">
            <Link href={`/${lang}/`} className="flex items-center gap-2.5 text-paper">
              <Mark size={22} className="text-sage" />
              <span className="font-display text-xl tracking-tight">Kalyx</span>
            </Link>
            <p className="max-w-sm text-sm font-light leading-relaxed text-mist">{t.footer.desc}</p>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <h3 className="mb-4 text-xs uppercase tracking-[0.18em] text-bone/70">{col.title}</h3>
              <ul className="space-y-2.5 text-sm">
                {col.links.map((l) => (
                  <li key={l.href}>
                    {'external' in l && l.external ? (
                      <a href={l.href} target="_blank" rel="noopener noreferrer" className="text-mist transition-colors hover:text-paper">
                        {l.label}
                      </a>
                    ) : (
                      <Link href={l.href} className="text-mist transition-colors hover:text-paper">
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="space-y-2 pt-8 text-xs font-light leading-relaxed text-mist/80">
          <p>
            <span className="text-bone/80">{t.footer.publisher}</span> {t.footer.publisherText}
          </p>
          <p>
            <span className="text-bone/80">{t.footer.hosting}</span> {t.footer.hostingText}
          </p>
          <div className="flex flex-col gap-2 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p>{t.footer.rights}</p>
            <p className="font-display italic text-bone/70">{t.footer.tagline}</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
