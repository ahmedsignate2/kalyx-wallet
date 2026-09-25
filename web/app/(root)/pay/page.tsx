import React from 'react';
import { PayRelay } from '../../../components/pay-relay';

/**
 * Lien universel de demande de paiement :
 * https://kalyxwallet.com/pay?uri=bitcoin:bc1…?amount=0.01
 *
 * Existe pour que la demande reste partageable. Un `bitcoin:` collé dans une
 * conversation n'est cliquable nulle part et ne mène nulle part sans un
 * portefeuille installé ; cette adresse-ci l'est toujours, et sert une page
 * d'installation à qui n'a pas encore Kalyx.
 *
 * Si Kalyx est installée, l'OS ouvre l'app sans passer par ici.
 */
export default function PayPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-16 text-center">
      <p className="font-display text-3xl">Kalyx</p>
      <PayRelay />
    </main>
  );
}
