/**
 * Liens profonds : ouvre Kalyx depuis l'extérieur.
 * - `wc:…` (ou `kalyx://wc?uri=…`) → appairage WalletConnect + écran WC.
 * - `kalyx://browse?url=https://…` → ouvre l'URL dans le navigateur dApps.
 * - `kalyx://<route>` est géré nativement par expo-router.
 *
 * Le schéma applicatif est déclaré dans app.config ; l'enregistrement système
 * de `wc:` (intent-filters) prend effet au prochain rebuild.
 */
import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { toast } from '../lib/toast';
import { useSettings } from '../lib/settingsStore';
import { translate } from '../lib/i18n';
import { useDriveFlow } from '../lib/googleDrive';
import { useSettings as useSettingsStore } from '../lib/settingsStore';
import { router } from 'expo-router';
import { useWalletConnect } from '../lib/walletconnect';

/** Extrait une URI WalletConnect d'un lien (directe ou via ?uri=). */
export function extractWcUri(url: string): string | null {
  if (url.startsWith('wc:')) return decodeURIComponent(url);
  
  // Correction pour les liens directs WalletConnect interceptés par le scheme kalyx://
  if (url.startsWith('kalyx://') && (url.includes('symKey=') || url.includes('relay-protocol='))) {
     return `wc:${url.slice('kalyx://'.length)}`;
  }
  
  const m = url.match(/[?&]uri=([^&]+)/);
  if (m) {
    try {
      const decoded = decodeURIComponent(m[1]);
      if (decoded.startsWith('wc:')) return decoded;
    } catch {
      return null;
    }
  }
  return null;
}

/** Extrait une URL https à ouvrir dans le navigateur (kalyx://browse?url=…). */
export function extractBrowseUrl(url: string): string | null {
  const m = url.match(/[?&]url=([^&]+)/);
  if (!m) return null;
  const decoded = decodeURIComponent(m[1]);
  return /^https:\/\//i.test(decoded) ? decoded : null;
}

export function DeepLinks() {
  useEffect(() => {
    const handle = async (url: string | null) => {
      if (!url) return;
      // Retour de Google (sauvegarde / restauration Drive) : repris ici même si
      // l'app a été relancée. Le résultat est publié dans useDriveFlow.
      if (await useDriveFlow.getState().handleRedirect(url)) {
        const f = useDriveFlow.getState();
        const lang = useSettingsStore.getState().language;
        if (f.kind === 'save' && f.status === 'done') {
          useSettingsStore.getState().markEncryptedBackup('drive');
          toast.success(translate(lang, 'driveSaved'));
        } else if (f.kind === 'restore') {
          router.replace('/restore-drive');
        } else if (f.status === 'error') {
          toast.error(translate(lang, 'driveCancelled'), f.error ?? undefined);
        }
        return;
      }
      const wc = extractWcUri(url);
      if (wc) {
        useWalletConnect.getState().pair(wc).catch((e) => toast.error(translate(useSettings.getState().language, 'connectionFailed'), e instanceof Error ? e.message : undefined));
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
