import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { kvGet, kvSet } from './kv';
import { LEGAL_CONSTANTS } from '../src/constants/legal';

const CHECK_INTERVAL_MS = 20 * 60 * 60 * 1000; // au plus une fois par ~20h
const LAST_CHECK_KEY = 'update_last_check_at';
const DISMISSED_VERSION_KEY = 'update_dismissed_version';

export interface UpdateInfo {
  version: string;
  downloadUrl: string;
}

function parseVersion(v: string): number[] {
  return v
    .replace(/^v/i, '')
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
}

/** `true` si `a` est strictement plus récente que `b` (comparaison numérique segment par segment). */
export function isNewerVersion(a: string, b: string): boolean {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/**
 * L'app est distribuée en APK direct (hors store) : la mise à jour se fait en
 * interrogeant la dernière GitHub Release du dépôt public (LEGAL_CONSTANTS.GITHUB_REPO),
 * pas via un mécanisme OTA (expo-updates, non utilisé ici). Échec silencieux si hors
 * ligne ou si l'API GitHub est indisponible.
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (Platform.OS === 'web') return null;
  const currentVersion = Constants.expoConfig?.version ?? '0.0.0';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`https://api.github.com/repos/${LEGAL_CONSTANTS.GITHUB_REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const tagName: string = data?.tag_name ?? '';
    if (!tagName || !isNewerVersion(tagName, currentVersion)) return null;

    const asset = Array.isArray(data?.assets)
      ? data.assets.find((a: { name?: string; browser_download_url?: string }) => a?.name?.endsWith('.apk'))
      : null;
    const downloadUrl: string = asset?.browser_download_url ?? `https://github.com/${LEGAL_CONSTANTS.GITHUB_REPO}/releases/latest`;

    return { version: tagName.replace(/^v/i, ''), downloadUrl };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Ne vérifie qu'une fois par ~20h, et ne repropose pas une version déjà refusée par l'utilisateur. */
export async function checkForUpdateThrottled(): Promise<UpdateInfo | null> {
  if (Platform.OS === 'web') return null;
  try {
    const lastCheck = await kvGet(LAST_CHECK_KEY);
    if (lastCheck && Date.now() - Number(lastCheck) < CHECK_INTERVAL_MS) return null;
    await kvSet(LAST_CHECK_KEY, String(Date.now()));

    const info = await checkForUpdate();
    if (!info) return null;

    const dismissed = await kvGet(DISMISSED_VERSION_KEY);
    if (dismissed === info.version) return null;

    return info;
  } catch {
    return null;
  }
}

export async function dismissUpdate(version: string): Promise<void> {
  try {
    await kvSet(DISMISSED_VERSION_KEY, version);
  } catch {
    // Non bloquant : au pire, l'alerte réapparaît au prochain cycle de vérification.
  }
}
