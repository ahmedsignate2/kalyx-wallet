/**
 * Sites récemment visités dans le navigateur dApps (non sensible → AsyncStorage).
 * Liste courte, dédupliquée par hôte, plus récent en premier.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'nova.recentDapps';
const MAX = 8;

export interface RecentDapp {
  url: string;
  host: string;
  title: string;
}

export async function loadRecents(): Promise<RecentDapp[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as RecentDapp[]) : [];
    return Array.isArray(list) ? list.slice(0, MAX) : [];
  } catch {
    return [];
  }
}

/** Ajoute une visite en tête (dédupliquée par hôte), persiste, renvoie la liste. */
export async function pushRecent(entry: RecentDapp, existing: RecentDapp[]): Promise<RecentDapp[]> {
  if (!entry.host) return existing;
  const next = [entry, ...existing.filter((r) => r.host !== entry.host)].slice(0, MAX);
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* silencieux */
  }
  return next;
}
