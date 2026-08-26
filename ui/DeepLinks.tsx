/**
 * Liens profonds : ouvre Nova depuis l'extérieur.
 * - `wc:…` (ou `novawallet://wc?uri=…`) → appairage WalletConnect + écran WC.
 * - `novawallet://browse?url=https://…` → ouvre l'URL dans le navigateur dApps.
 * - `novawallet://<route>` est géré nativement par expo-router.
 *
 * Le schéma applicatif est déclaré dans app.config ; l'enregistrement système
 * de `wc:` (intent-filters) prend effet au prochain rebuild.
 */
import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useWalletConnect } from '../lib/walletconnect';

/** Extrait une URI WalletConnect d'un lien (directe ou via ?uri=). */
export function extractWcUri(url: string): string | null {
  if (url.startsWith('wc:')) return url;
  
  // Correction pour les liens directs WalletConnect interceptés par le scheme novawallet://
  if (url.startsWith('novawallet://') && (url.includes('symKey=') || url.includes('relay-protocol='))) {
     return url.replace(/^novawallet:\/\//, 'wc:');
  }
  
  const m = url.match(/[?&]uri=([^&]+)/);
  if (m) {
    const decoded = decodeURIComponent(m[1]);
    if (decoded.startsWith('wc:')) return decoded;
  }
  return null;
}

/** Extrait une URL https à ouvrir dans le navigateur (novawallet://browse?url=…). */
export function extractBrowseUrl(url: string): string | null {
  const m = url.match(/[?&]url=([^&]+)/);
  if (!m) return null;
  const decoded = decodeURIComponent(m[1]);
  return /^https:\/\//i.test(decoded) ? decoded : null;
}

export function DeepLinks() {
  useEffect(() => {
    const handle = (url: string | null) => {
      if (!url) return;
      const wc = extractWcUri(url);
      if (wc) {
        useWalletConnect.getState().pair(wc).catch(() => {});
        router.push('/walletconnect');
        return;
      }
      if (/(^|\/\/)browse\b/i.test(url)) {
        const target = extractBrowseUrl(url);
        if (target) router.push({ pathname: '/browser', params: { url: target } });
      }
    };
    Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    return () => sub.remove();
  }, []);
  return null;
}
