import React from 'react';
import { TcRelay } from '../../../components/tc-relay';

/**
 * Lien universel TON Connect : https://kalyxwallet.com/ton-connect?v=2&id=…&r=…
 * (déclaré dans la liste officielle des wallets TON). Si Kalyx est installée,
 * l'OS ouvre l'app directement ; sinon cette page relaie vers kalyx://.
 */
export default function TonConnectPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-16 text-center">
      <p className="font-display text-3xl">Kalyx</p>
      <TcRelay />
    </main>
  );
}
