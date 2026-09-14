import type { Metadata } from 'next';
import './globals.css';

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className="dark scroll-smooth">
      <body className="min-h-screen bg-background text-slate-100 antialiased selection:bg-primary/30 selection:text-white">
        {children}
      </body>
    </html>
  );
}
