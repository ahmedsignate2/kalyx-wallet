'use client';

import { useEffect, useState } from 'react';
import { APK_URL } from '../lib/apk';

/**
 * Relais TON Connect : une dApp qui a choisi Kalyx (liste officielle des
 * wallets) ouvre https://kalyxwallet.com/ton-connect?v=2&id=…&r=…
 * Si l'App Link n'a pas ouvert l'app, on transmet la même requête à
 * kalyx://?… ; après 1,5 s sans bascule, on propose l'APK.
 */
export function TcRelay() {
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const target = `kalyx://${window.location.search}`;
    setDeepLink(target);
    window.location.href = target;
    const t = setTimeout(() => setFallback(true), 1500);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="mt-8 flex flex-col items-center gap-4">
      <p className="text-mist">{fallback ? 'Kalyx ne semble pas installée sur cet appareil.' : 'Ouverture de Kalyx…'}</p>
      {deepLink && (
        <a href={deepLink} className="inline-flex h-12 items-center rounded-full bg-paper px-6 text-sm font-medium text-ink">
          Ouvrir dans Kalyx
        </a>
      )}
      {fallback && (
        <a href={APK_URL} download className="text-sm text-mist underline underline-offset-4 hover:text-paper">
          Télécharger Kalyx pour Android
        </a>
      )}
    </div>
  );
}
