import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';

/** General Sans — la seule famille du site (bible §2), servie en local. */
const generalSans = localFont({
  src: [
    { path: './fonts/GeneralSans-Regular.ttf', weight: '400', style: 'normal' },
    { path: './fonts/GeneralSans-Medium.ttf', weight: '500', style: 'normal' },
    { path: './fonts/GeneralSans-Semibold.ttf', weight: '600', style: 'normal' },
    { path: './fonts/GeneralSans-Bold.ttf', weight: '700', style: 'normal' },
  ],
  variable: '--font-general-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://kalyxwallet.com'),
  title: 'Kalyx Wallet — Portefeuille Web3 Non-Custodial & Multi-Chaînes',
  description:
    'Portefeuille crypto non-custodial nouvelle génération. Vos clés privées restent sur votre appareil. Multi-chaînes (Ethereum, Solana, Bitcoin, L2), swap instantané et sécurité biométrique.',
  keywords: [
    'crypto wallet',
    'non-custodial wallet',
    'ethereum wallet',
    'solana wallet',
    'bitcoin wallet',
    'web3 wallet',
    'defi',
    'kalyx',
  ],
  authors: [{ name: 'Kalyx', url: 'https://kalyxwallet.com' }],
  openGraph: {
    title: 'Kalyx Wallet — Portefeuille Web3 Non-Custodial',
    description:
      'Gérez vos actifs sur Ethereum, Solana et Bitcoin sans aucun compromis sur la sécurité. Vos clés, vos cryptos.',
    url: 'https://kalyxwallet.com',
    siteName: 'Kalyx Wallet',
    type: 'website',
    locale: 'fr_FR',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Kalyx Wallet — Portefeuille Web3 Non-Custodial',
    description:
      'Portefeuille crypto non-custodial nouvelle génération. Multi-chaînes, sécurité matérielle et swap instantané.',
    creator: '@kalyxntw',
  },
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`dark ${generalSans.variable}`}>
      <body className="min-h-screen bg-encre font-sans text-lueur selection:bg-lumiere/25 selection:text-lueur">
        {children}
      </body>
    </html>
  );
}
