/**
 * Sites récemment visités dans le navigateur dApps (non sensible → AsyncStorage).
 * Liste courte, dédupliquée par hôte, plus récent en premier.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'nova.recentDapps';
const FAV_KEY = 'nova.favDapps';
const MAX = 50;
const FAV_MAX = 24;

export interface RecentDapp {
  url: string;
  host: string;
  title: string;
  lastVisitedAt?: number;
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
  const stamped = { ...entry, lastVisitedAt: Date.now() };
  const next = [stamped, ...existing.filter((r) => r.host !== entry.host)].slice(0, MAX);
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* silencieux */
  }
  return next;
}

/** Efface tout l'historique. */
export async function clearRecents(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    /* silencieux */
  }
}

export async function loadFavorites(): Promise<RecentDapp[]> {
  try {
    const raw = await AsyncStorage.getItem(FAV_KEY);
    const list = raw ? (JSON.parse(raw) as RecentDapp[]) : [];
    return Array.isArray(list) ? list.slice(0, FAV_MAX) : [];
  } catch {
    return [];
  }
}

/** Ajoute/retire un site des favoris (bascule par hôte), persiste, renvoie la liste. */
export async function toggleFavorite(entry: RecentDapp, existing: RecentDapp[]): Promise<RecentDapp[]> {
  if (!entry.host) return existing;
  const exists = existing.some((f) => f.host === entry.host);
  const next = exists ? existing.filter((f) => f.host !== entry.host) : [entry, ...existing].slice(0, FAV_MAX);
  try {
    await AsyncStorage.setItem(FAV_KEY, JSON.stringify(next));
  } catch {
    /* silencieux */
  }
  return next;
}
