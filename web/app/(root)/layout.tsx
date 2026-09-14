import type { Metadata } from 'next';
import '../globals.css';
import { HTML_LANG, LOCALES } from '../../i18n';

const SITE = 'https://kalyxwallet.com';

/** Racine `/` : page d'aiguillage vers la langue du navigateur (export statique → pas de serveur). */
export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: 'Kalyx Wallet',
  description: 'Non-custodial, multi-chain crypto wallet. Your keys stay on your phone.',
  robots: { index: false, follow: true },
  alternates: {
    canonical: `${SITE}/`,
    languages: { ...Object.fromEntries(LOCALES.map((l) => [HTML_LANG[l], `${SITE}/${l}/`])), 'x-default': `${SITE}/` },
  },
  icons: { icon: '/icon.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink text-paper">{children}</body>
    </html>
  );
}
