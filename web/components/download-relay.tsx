'use client';

import { useEffect, useState } from 'react';
import { STORES, DIRECT_APK_URL, type StoreEntry } from '../lib/stores';
import { RELEASE_LATEST_URL, SOURCE_URL } from '../lib/links';
import { useRelayText } from './relay-i18n';

type Status = 'detecting' | 'redirecting' | 'manual';

/**
 * Aiguillage /download : détecte l'appareil et redirige vers le store adapté,
 * sans jamais coder ce lien en dur dans l'app (le bouton « Partager » de
 * l'app pointe toujours ici, cf. lib/appLinks.ts). Ajouter un store plus
 * tard = une entrée dans web/lib/stores.ts, rien à changer ici ni dans l'app
 * déjà installée chez les utilisateurs.
 */
export function DownloadRelay() {
  const [status, setStatus] = useState<Status>('detecting');
  const [store, setStore] = useState<StoreEntry | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isDirectApk, setIsDirectApk] = useState(false);
  const tx = useRelayText();

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();

    if (/iphone|ipad|ipod/.test(ua)) {
      setIsIOS(true);
      setStatus('manual');
      return;
    }

    const matched = STORES.find((s) => s.match(ua)) ?? null;
    setStatus('redirecting');
    if (matched) {
      setStore(matched);
      window.location.href = matched.deepLink;
    } else {
      setIsDirectApk(true);
      window.location.href = DIRECT_APK_URL;
    }
    const t = setTimeout(() => setStatus('manual'), 1500);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="mt-8 flex flex-col items-center gap-5">
      <p className="text-mist">
        {isIOS
          ? tx.iosSoon
          : status === 'manual'
            ? tx.manual
            : tx.redirecting}
      </p>

      {store && status === 'manual' && (
        <a href={store.deepLink} className="inline-flex h-12 items-center rounded-full bg-paper px-6 text-sm font-medium text-ink">
          {tx.openStore(store.label)}
        </a>
      )}

      <div className="flex flex-col items-center gap-3">
        {STORES.map((s) => (
          <a key={s.id} href={s.webUrl} className="text-sm text-mist underline underline-offset-4 hover:text-paper">
            {s.label}
          </a>
        ))}
        <a href={DIRECT_APK_URL} download className="text-sm text-mist underline underline-offset-4 hover:text-paper">
          {tx.directApk}
        </a>
      </div>

      {isDirectApk && status === 'manual' && (
        <p className="max-w-xs text-xs text-mist/70">{tx.noStore}</p>
      )}

      <p className="max-w-sm text-xs leading-relaxed text-mist/60">
        {tx.verify}{' '}
        <a href={RELEASE_LATEST_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-paper">{tx.releases}</a>
        {' · '}
        <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-paper">{tx.source}</a>.
      </p>
    </div>
  );
}
