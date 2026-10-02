/**
 * RIDEAU de la session leurre (code de contrainte).
 *
 * Entrée : tout ce qui trahirait les vrais portefeuilles est vidé DE LA MÉMOIRE
 * (contacts, destinataires récents, sites et signatures de dApps, onglets,
 * sessions WalletConnect / TON Connect, transactions Bitcoin en attente,
 * notifications, conversations, dates de sauvegarde), et le stockage passe en
 * lecture seule (pare-feu : lib/sessionMode + kv + AsyncStorage ci-dessous).
 *
 * Sortie : l'app REDÉMARRE — aucune trace du leurre ne reste en mémoire, et
 * tout est relu depuis le disque, intact. Sans redémarrage possible (développement),
 * repli : rechargement de l'état réel.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isDecoySession, setDecoySession } from './sessionMode';

let patched = false;
/** AsyncStorage en lecture seule pendant la session leurre ; lectures vides (rien du vrai historique). */
function patchAsyncStorage(): void {
  if (patched) return;
  patched = true;
  const S = AsyncStorage as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
  for (const m of ['setItem', 'removeItem', 'mergeItem', 'multiSet', 'multiRemove', 'multiMerge', 'clear']) {
    const orig = S[m];
    if (typeof orig !== 'function') continue;
    S[m] = (...a: unknown[]) => (isDecoySession() ? Promise.resolve() : orig.apply(AsyncStorage, a));
  }
  const get = S.getItem;
  if (typeof get === 'function') S.getItem = (...a: unknown[]) => (isDecoySession() ? Promise.resolve(null) : get.apply(AsyncStorage, a));
  const multiGet = S.multiGet;
  if (typeof multiGet === 'function') {
    S.multiGet = (...a: unknown[]) => (isDecoySession() ? Promise.resolve((a[0] as string[]).map((k) => [k, null])) : multiGet.apply(AsyncStorage, a));
  }
}

const clearers: (() => void)[] = [];
/** Les magasins à vider à l'entrée (enregistrés ici, chargés à la demande pour éviter les cycles). */
async function clearMemory(): Promise<void> {
  const tasks: Promise<unknown>[] = [
    import('./contactsStore').then((m) => m.useContacts.setState({ contacts: [] })),
    import('./recentRecipientsStore').then((m) => m.useRecentRecipients.setState({ recents: [] })),
    import('./dappActivity').then((m) => m.useDappActivity.setState({ connections: [], signatures: [], remembered: [] })),
    import('./pendingBtc').then((m) => m.usePendingBtc.setState({ txs: [] })),
    import('./notificationCenter').then((m) => m.useNotifCenter.setState({ items: [] })),
    import('./aiChatHistoryStore').then((m) => m.useAiChatHistoryStore.setState({ sessions: [], activeSessionId: null })),
    import('./walletconnect').then((m) => m.useWalletConnect.setState({ sessions: [] } as never)),
    import('./tonconnect/store').then((m) => m.useTonConnect.setState({ sessions: [] } as never)),
    import('./settingsStore').then((m) => m.useSettings.setState({ encryptedBackupAt: null, driveBackupAt: null } as never)),
    import('./historyStore').then((m) => m.useHistoryStore.setState({ cache: {}, lastFetch: {} } as never)),
    import('./customTokensStore').then((m) => m.useCustomTokens.setState({ byChain: {} } as never)),
    import('./priceAlertsStore').then((m) => m.usePriceAlerts.setState({ alerts: [] } as never)),
    import('./ticketHistoryStore').then((m) => m.useTicketHistoryStore.setState({ tickets: [] } as never)),
    import('./tonconnect/store').then((m) => m.useTonConnect.setState({ sessions: [], queue: [], hydrated: false } as never)),
    import('./walletconnect').then((m) => m.useWalletConnect.setState({ requestQueue: [], request: null, proposal: null } as never)),
    import('./debugJournal').then((m) => m.clearJournal()),
  ];
  await Promise.all(tasks.map((t) => t.catch(() => {})));
  for (const c of clearers) c();
}

/** Entrée en session leurre : pare-feu, puis mémoire vidée. */
export async function drawCurtain(decoyId: string): Promise<void> {
  patchAsyncStorage();
  setDecoySession(true, [decoyId]);
  await clearMemory();
}

/**
 * Sortie : redémarrage de l'app (rien du leurre ne survit). Le pare-feu RESTE
 * actif jusqu'au redémarrage (un minuteur ne peut rien écrire entre-temps).
 * Repli si impossible : pare-feu levé, puis TOUS les magasins vidés sont relus
 * depuis le disque avant de rendre la main.
 */
export async function liftCurtain(fallback: () => void): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const U = require('expo-updates') as { isEnabled?: boolean; reloadAsync?: () => Promise<void> };
    if (U?.isEnabled && U.reloadAsync) {
      await U.reloadAsync();
      return;
    }
  } catch {
    /* pas de module : repli */
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DevSettings } = require('react-native') as { DevSettings?: { reload?: () => void } };
    if (__DEV__ && DevSettings?.reload) {
      DevSettings.reload();
      return;
    }
  } catch {
    /* repli */
  }
  setDecoySession(false);
  await reloadMemory();
  fallback();
}

async function reloadMemory(): Promise<void> {
  const tasks: Promise<unknown>[] = [
    import('./settingsStore').then((m) => m.useSettings.getState().load()),
    import('./contactsStore').then((m) => m.useContacts.getState().load()),
    import('./recentRecipientsStore').then((m) => m.useRecentRecipients.getState().load()),
    import('./dappActivity').then((m) => m.useDappActivity.getState().load()),
    import('./pendingBtc').then((m) => m.usePendingBtc.getState().load()),
    import('./notificationCenter').then((m) => m.useNotifCenter.getState().load()),
    import('./aiChatHistoryStore').then((m) => m.useAiChatHistoryStore.persist.rehydrate()),
    import('./customTokensStore').then((m) => m.useCustomTokens.getState().load()),
    import('./priceAlertsStore').then((m) => m.usePriceAlerts.getState().load()),
    import('./tonconnect/store').then((m) => m.useTonConnect.getState().hydrate()),
    import('./walletconnect').then((m) => m.useWalletConnect.getState().refresh()),
  ];
  await Promise.all(tasks.map((t) => t.catch(() => {})));
}
