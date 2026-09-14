import React from 'react';
import { WcRelay } from '../../../components/wc-relay';

/**
 * Universal Link WalletConnect : https://kalyxwallet.com/wc?uri=wc:…
 * Si Kalyx est installée, l'OS ouvre l'app directement (App Link / Universal Link).
 * Sinon cette page tente le deep link kalyx://wc?uri=… puis propose le téléchargement.
 */
export default function WcPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-16 text-center">
      <p className="font-display text-3xl">Kalyx</p>
      <WcRelay />
    </main>
  );
}
