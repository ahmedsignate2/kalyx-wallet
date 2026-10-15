import React from 'react';

/**
 * Fin d'achat MoonPay : https://kalyxwallet.com/buy/complete?transactionId=…
 *
 * Dans l'app, la vue web du widget intercepte cette adresse avant qu'elle ne
 * charge. Cette page ne sert que lorsque le widget a tourné dans le navigateur
 * (Google Pay) : elle renvoie vers l'app, où l'achat apparaîtra.
 */
export default function BuyComplete() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <p className="font-display text-3xl">Kalyx</p>
      <p className="text-lg">Purchase in progress · Achat en cours</p>
      <p className="max-w-sm opacity-70">
        MoonPay is processing your payment. Your crypto will arrive in your Kalyx wallet. · MoonPay traite ton paiement, ta crypto arrivera dans
        ton portefeuille Kalyx.
      </p>
      <a className="rounded-full bg-black px-6 py-3 text-white" href="kalyx://home">
        Open Kalyx · Ouvrir Kalyx
      </a>
    </main>
  );
}
