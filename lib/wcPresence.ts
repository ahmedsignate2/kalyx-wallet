/**
 * SIGNE DE VIE des connexions WalletConnect.
 *
 * Une session WalletConnect reste enregistrée 7 jours, que l'autre côté soit
 * là ou non : une extension supprimée, un navigateur fermé ne préviennent
 * personne. Afficher « connecté » sur la seule foi de la session était faux.
 *
 * On retient donc, par session, le DERNIER SIGNE DE VIE réel de l'autre côté :
 *  - une demande reçue de lui (signature, lecture, ou le `kalyx_ping` que
 *    l'extension envoie au démarrage du navigateur puis toutes les 3 h) ;
 *  - une réponse à notre propre `ping` (à l'ouverture de l'écran des connexions) ;
 *  - l'approbation de la session elle-même.
 * Rien de secret : des sujets de session et des dates, en AsyncStorage.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'kalyx.wc.presence';

/** Répondu il y a moins de 3 min : actif. */
export const ONLINE_MS = 3 * 60_000;
/** Au-delà de 24 h sans signe de vie : silencieux (navigateur fermé, extension supprimée ?). */
export const SILENT_MS = 24 * 3_600_000;

export type Presence = 'online' | 'recent' | 'silent' | 'unknown';

export function presenceOf(lastSeen: number | undefined, now = Date.now()): Presence {
  if (!lastSeen) return 'unknown';
  const age = now - lastSeen;
  if (age < ONLINE_MS) return 'online';
  return age < SILENT_MS ? 'recent' : 'silent';
}

export async function loadPresence(): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    if (!v || typeof v !== 'object') return {};
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter((e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1])));
  } catch {
    return {};
  }
}

/** Ne garde que les sessions encore ouvertes (`alive`). */
export async function savePresence(map: Record<string, number>, alive: string[]): Promise<Record<string, number>> {
  const keep = new Set(alive);
  const next = Object.fromEntries(Object.entries(map).filter(([t]) => keep.has(t)));
  await AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  return next;
}
