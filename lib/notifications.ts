/**
 * Notifications locales (expo-notifications).
 *
 * IMPORTANT : le module natif n'est présent qu'après un dev build EAS. Il est
 * donc chargé en IMPORT DYNAMIQUE et chaque fonction est un no-op sûr tant que
 * le rebuild n'a pas eu lieu — l'app ne crashe pas, elle n'affiche simplement
 * pas de notification. Aucune donnée sensible n'est jamais notifiée.
 */

type NotifModule = typeof import('expo-notifications');

let mod: NotifModule | null = null;
let loaded = false;

async function getModule(): Promise<NotifModule | null> {
  if (loaded) return mod;
  loaded = true;
  try {
    mod = await import('expo-notifications');
    // Affiche la bannière même app au premier plan (feedback immédiat).
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  } catch {
    mod = null; // pas rebuildé : on reste silencieux
  }
  return mod;
}

/** Demande la permission (idempotent). `false` si refusée ou module absent. */
export async function ensureNotifPermission(): Promise<boolean> {
  const m = await getModule();
  if (!m) return false;
  try {
    const { status } = await m.getPermissionsAsync();
    if (status === 'granted') return true;
    const req = await m.requestPermissionsAsync();
    return req.status === 'granted';
  } catch {
    return false;
  }
}

/** Notification locale immédiate (title + corps). Silencieuse si indispo. */
export async function notify(title: string, body: string): Promise<void> {
  const m = await getModule();
  if (!m) return;
  try {
    if (!(await ensureNotifPermission())) return;
    await m.scheduleNotificationAsync({ content: { title, body }, trigger: null });
  } catch {
    // no-op
  }
}

/** True si le module natif est disponible (utile pour l'UI Réglages). */
export async function notificationsAvailable(): Promise<boolean> {
  return (await getModule()) != null;
}
