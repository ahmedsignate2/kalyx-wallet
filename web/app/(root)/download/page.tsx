import React from 'react';
import { DownloadRelay } from '../../../components/download-relay';

/**
 * Lien de téléchargement unique et évolutif : https://kalyxwallet.com/download
 * C'est CE lien que l'app partage (invite.tsx) et que le site affiche, jamais
 * l'URL d'un store précis — ajouter un store (AppGallery, GetApps, Play
 * Store…) se fait dans web/lib/stores.ts, sans mise à jour de l'app.
 */
export default function DownloadPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-16 text-center">
      <p className="font-display text-3xl">Kalyx</p>
      <DownloadRelay />
    </main>
  );
}
