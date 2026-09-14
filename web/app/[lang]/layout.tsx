import type { Metadata } from 'next';
import { Fraunces, Outfit } from 'next/font/google';
import { notFound } from 'next/navigation';
import '../globals.css';
import { getDictionary, HTML_LANG, isLocale, LOCALES, RTL, type Locale } from '../../i18n';

/** Outfit pour le texte, Fraunces (serif à caractère) pour les titres. */
const outfit = Outfit({
  subsets: ['latin', 'latin-ext'],
  weight: 'variable',
  variable: '--font-outfit',
  display: 'swap',
});

const fraunces = Fraunces({
  subsets: ['latin', 'latin-ext'],
  weight: 'variable',
  style: ['normal', 'italic'],
  axes: ['opsz'],
  variable: '--font-fraunces',
  display: 'swap',
});

export const dynamicParams = false;

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

const SITE = 'https://kalyxwallet.com';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = getDictionary(lang);
  const languages = Object.fromEntries(LOCALES.map((l) => [HTML_LANG[l], `${SITE}/${l}/`]));
  return {
    metadataBase: new URL(SITE),
    title: t.meta.title,
    description: t.meta.description,
    keywords: ['crypto wallet', 'non-custodial wallet', 'ethereum wallet', 'solana wallet', 'bitcoin wallet', 'web3 wallet', 'defi', 'kalyx'],
    authors: [{ name: 'Kalyx', url: SITE }],
    alternates: { canonical: `${SITE}/${lang}/`, languages: { ...languages, 'x-default': `${SITE}/` } },
    openGraph: {
      title: t.meta.title,
      description: t.meta.description,
      url: `${SITE}/${lang}/`,
      siteName: 'Kalyx Wallet',
      type: 'website',
      locale: HTML_LANG[lang].replace('-', '_'),
    },
    twitter: { card: 'summary_large_image', title: t.meta.title, description: t.meta.description, creator: '@kalyxntw' },
    icons: { icon: '/favicon.ico' },
  };
}

export default async function RootLayout({ children, params }: { children: React.ReactNode; params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const locale: Locale = lang;
  return (
    <html lang={HTML_LANG[locale]} dir={RTL.has(locale) ? 'rtl' : 'ltr'} className={`${outfit.variable} ${fraunces.variable}`}>
      <body className="min-h-screen bg-ink font-sans text-paper">
        {children}
      </body>
    </html>
  );
}
