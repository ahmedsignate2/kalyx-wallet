'use client';

import { useEffect, useState } from 'react';
import { APK_URL } from '../lib/apk';
import { useRelayText } from './relay-i18n';

/** Relais deep link : ouvre kalyx://wc?uri=… ; après 1,5 s sans bascule, propose l'APK. */
export function WcRelay() {
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [fallback, setFallback] = useState(false);
  const tx = useRelayText();

  useEffect(() => {
    const uri = new URLSearchParams(window.location.search).get('uri');
    const target = uri ? `kalyx://wc?uri=${encodeURIComponent(uri)}` : 'kalyx://';
    setDeepLink(target);
    window.location.href = target;
    const t = setTimeout(() => setFallback(true), 1500);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="mt-8 flex flex-col items-center gap-4">
      <p className="text-mist">{fallback ? tx.notInstalled : tx.opening}</p>
      {deepLink && (
        <a href={deepLink} className="inline-flex h-12 items-center rounded-full bg-paper px-6 text-sm font-medium text-ink">
          {tx.openInKalyx}
        </a>
      )}
      {fallback && (
        <a href={APK_URL} download className="text-sm text-mist underline underline-offset-4 hover:text-paper">
          {tx.downloadAndroid}
        </a>
      )}
    </div>
  );
}
