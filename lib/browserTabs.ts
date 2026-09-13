/**
 * Persistance des onglets ouverts du navigateur (non sensible → AsyncStorage).
 * On ne garde que l'essentiel (id, url, titre) : au rechargement, chaque WebView
 * repart de son URL. Les onglets « survivent » donc quand on quitte puis rouvre.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'nova.browserTabs';

export interface PersistedTab {
  id: string;
  url: string | null;
  title: string;
  /** Réseau EVM suivi par l'onglet (id Kalyx). */
  chainId?: string;
}

export async function saveTabs(tabs: PersistedTab[], activeId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify({ tabs, activeId }));
  } catch {
    /* silencieux */
  }
}

export async function loadTabs(): Promise<{ tabs: PersistedTab[]; activeId: string } | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as { tabs?: PersistedTab[]; activeId?: string };
    return Array.isArray(d.tabs) && d.tabs.length ? { tabs: d.tabs, activeId: d.activeId ?? d.tabs[0].id } : null;
  } catch {
    return null;
  }
}
