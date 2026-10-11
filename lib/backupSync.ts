/**
 * Synchronisation AUTOMATIQUE de la sauvegarde chiffrée vers Google Drive.
 *
 * Ce moteur ne connaît AUCUN secret : il ne fait que décider QUAND envoyer.
 * Le contenu (déjà chiffré) vient d'un fournisseur enregistré par le module des
 * clés (`registerSyncFileProvider`) ; l'envoi lui-même réutilise la garde
 * d'écrasement et la vérification MD5 de `saveBackupGuarded` (drive.ts) — on
 * ne réécrit pas l'atomicité ici.
 *
 * Pourquoi chaque mécanisme :
 *  - DEBOUNCE 8 s : une restauration ou un renommage enchaîne plusieurs
 *    mutations ; un seul envoi suffit, et chaque envoi coûte un rafraîchissement
 *    de jeton + 3 à 5 requêtes Drive.
 *  - MUTEX : deux envois simultanés liraient la même `rev` distante et
 *    créeraient deux fichiers concurrents. Un marquage pendant un envoi en
 *    déclenche UN nouveau à la fin (le contenu envoyé était peut-être déjà périmé).
 *  - DRAPEAU « SALE » PERSISTANT (AsyncStorage : un booléen + un horodatage,
 *    aucune donnée) : une mutation suivie d'un arrêt de l'app avant l'envoi ne
 *    doit pas laisser Drive en retard indéfiniment.
 *  - DÉLAI CROISSANT (30 s → 1 h) sur erreur réseau / vérification : ne pas
 *    vider la batterie hors ligne, sans jamais abandonner.
 *  - CONFLIT : jamais d'écrasement automatique ; l'utilisateur tranche à l'écran.
 *  - RECONNEXION : refresh_token refusé → purgé, et AUCUN navigateur ouvert
 *    d'office (une page Google surgissant seule est exactement ce qu'imite un
 *    hameçonnage) ; l'écran propose « Reconnecter ».
 *  - SESSION LEURRE : rien — ni réseau, ni écriture, ni lecture du trousseau.
 *
 * Le refresh_token reste dans le trousseau (lib/googleDrive.ts) ; le jeton
 * d'accès n'existe que dans une variable locale le temps d'UN envoi. L'état
 * exposé (`useBackupSync`) ne contient que des informations non sensibles.
 */
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { useStore } from 'zustand';
import {
  DriveVerifyError,
  isTransientError,
  saveBackupGuarded,
  type AcceptedRemote,
  type ConflictInfo,
  type GuardedSaveResult,
  type KnownRemote,
} from '../src/domain/backup/drive';
import {
  forgetKnown,
  loadRefreshToken,
  purgeRefreshToken,
  readKnown,
  refreshAccessToken,
  revokeToken,
  useDriveFlow,
  writeKnown,
} from './googleDrive';
import { isDecoySession } from './sessionMode';
import { getDeviceId } from './deviceId';
import { useSettings } from './settingsStore';

/* ------------------------------------------------------------------ */
/* Contrat                                                             */
/* ------------------------------------------------------------------ */

/** null = rien à envoyer (synchro inactive, clés absentes, session leurre…). */
/**
 * `digest` : empreinte (lib/backupDigest.ts) de CE fichier, enregistrée telle
 * quelle quand l'envoi est vérifié. Une empreinte globale « du dernier export »
 * pouvait être remplacée entre-temps par un export manuel : la sauvegarde
 * envoyée aurait été déclarée conforme à un autre contenu.
 */
export type SyncFileProvider = () => Promise<{ content: string; count: number; digest: string | null } | null>;

export type SyncStatus = 'idle' | 'pending' | 'syncing' | 'ok' | 'conflict' | 'reconnect' | 'error';

export interface BackupSyncState {
  enabled: boolean;
  status: SyncStatus;
  /** ISO 8601 du dernier envoi VÉRIFIÉ. */
  lastSyncAt: string | null;
  /** Code court : `network`, `verify`, `no_refresh_token`, `refresh_failed`, ou message. */
  error: string | null;
  /** Conflit en attente de décision (nombres, date, appareil — rien de secret). */
  conflict: ConflictInfo | null;
  /** Un refresh_token est présent dans le trousseau (activation en cours ou synchro active). */
  authorized: boolean;
}

export const SYNC_DEBOUNCE_MS = 8_000;
export const RETRY_BASE_MS = 30_000;
export const RETRY_MAX_MS = 60 * 60_000;
/** La révocation ne doit pas bloquer la désactivation hors ligne. */
const REVOKE_TIMEOUT_MS = 5_000;

/** État persisté (AsyncStorage) : aucun secret, aucune donnée de portefeuille. */
const STATE_KEY = 'kalyx.backupSync.state';
interface Persisted {
  enabled: boolean;
  dirty: boolean;
  dirtyAt: number | null;
  lastSyncAt: string | null;
}

/** Délai avant la n-ième nouvelle tentative (n ≥ 1) : 30 s, 1 min, 2 min… plafonné à 1 h. */
export function retryDelay(attempt: number): number {
  return Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1));
}

/* ------------------------------------------------------------------ */
/* Dépendances (injectables pour les tests)                            */
/* ------------------------------------------------------------------ */

export interface SyncDeps {
  isDecoy: () => boolean;
  storage: {
    getItem: (k: string) => Promise<string | null>;
    setItem: (k: string, v: string) => Promise<void>;
    removeItem: (k: string) => Promise<void>;
  };
  loadRefreshToken: () => Promise<string | null>;
  purgeRefreshToken: () => Promise<void>;
  refreshAccessToken: (refreshToken: string) => Promise<string>;
  revokeToken: (token: string) => Promise<void>;
  saveGuarded: (
    token: string,
    opts: { content: string; deviceId: string; known?: KnownRemote | null; accept?: AcceptedRemote | null },
  ) => Promise<GuardedSaveResult>;
  getDeviceId: () => Promise<string>;
  readKnown: () => Promise<KnownRemote | null>;
  writeKnown: (k: KnownRemote) => Promise<void>;
  forgetKnown: () => Promise<void>;
  /** Pose la source de vérité locale « sauvegarde Drive à jour ». */
  markBackedUp: (digest: string | null) => void;
  now: () => number;
}

export interface BackupSyncEngine {
  store: StoreApi<BackupSyncState>;
  init: () => Promise<void>;
  registerSyncFileProvider: (p: SyncFileProvider) => void;
  markBackupDirty: (reason: string) => void;
  syncBackupNow: () => Promise<void>;
  enableAutoSync: () => Promise<void>;
  onAuthorized: () => Promise<void>;
  replaceRemoteOnConflict: () => Promise<void>;
  dismissConflict: () => void;
  onForeground: () => void;
  disableAutoSync: () => Promise<void>;
  resetAutoSync: () => Promise<void>;
  onAutoSyncDisabled: (cb: () => Promise<void>) => void;
}

/** Le refresh_token est-il définitivement refusé ? (codes de lib/googleDrive.ts) */
function isAuthRejected(e: unknown): boolean {
  return !!e && typeof e === 'object' && (e as { code?: unknown }).code === 'invalid_grant';
}

function errorCode(e: unknown): string {
  if (e instanceof DriveVerifyError) return 'verify';
  if (isTransientError(e)) return 'network';
  const code = e && typeof e === 'object' ? (e as { code?: unknown }).code : undefined;
  if (typeof code === 'string') return code;
  return e instanceof Error ? e.message : String(e);
}

/* ------------------------------------------------------------------ */
/* Moteur                                                              */
/* ------------------------------------------------------------------ */

export function createBackupSyncEngine(deps: SyncDeps): BackupSyncEngine {
  const store = createStore<BackupSyncState>(() => ({
    enabled: false,
    status: 'idle',
    lastSyncAt: null,
    error: null,
    conflict: null,
    authorized: false,
  }));
  const set = (p: Partial<BackupSyncState>) => store.setState(p);

  let provider: SyncFileProvider | null = null;
  const disabledHooks: (() => Promise<void>)[] = [];

  let dirty = false;
  let dirtyAt: number | null = null;
  /** Incrémenté à chaque marquage : un envoi ne nettoie le drapeau que si rien n'a changé pendant. */
  let generation = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let failures = 0;
  let running: Promise<void> | null = null;
  let again = false;
  /** Change à chaque désactivation : un envoi en vol n'écrit plus son résultat. */
  let epoch = 0;
  let initPromise: Promise<void> | null = null;

  const persist = () => {
    if (deps.isDecoy()) return;
    const p: Persisted = { enabled: store.getState().enabled, dirty, dirtyAt, lastSyncAt: store.getState().lastSyncAt };
    deps.storage.setItem(STATE_KEY, JSON.stringify(p)).catch(() => {});
  };

  const clearTimers = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    if (retryTimer) clearTimeout(retryTimer);
    debounceTimer = null;
    retryTimer = null;
  };

  /** Pas d'envoi automatique pendant un conflit ou une reconnexion : l'utilisateur doit agir. */
  const blocked = () => {
    const s = store.getState().status;
    return s === 'conflict' || s === 'reconnect';
  };

  const scheduleDebounce = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void syncBackupNow();
    }, SYNC_DEBOUNCE_MS);
  };

  const scheduleRetry = () => {
    failures += 1;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void syncBackupNow();
    }, retryDelay(failures));
  };

  const init = () => {
    if (!initPromise) {
      initPromise = (async () => {
        if (deps.isDecoy()) return;
        try {
          const raw = await deps.storage.getItem(STATE_KEY);
          const p = raw ? (JSON.parse(raw) as Partial<Persisted>) : null;
          if (p) {
            dirty = p.dirty === true;
            dirtyAt = typeof p.dirtyAt === 'number' ? p.dirtyAt : null;
            set({
              enabled: p.enabled === true,
              lastSyncAt: typeof p.lastSyncAt === 'string' ? p.lastSyncAt : null,
            });
          }
        } catch {
          /* état illisible : on repart désactivé, sans rien supposer */
        }
        const authorized = !!(await deps.loadRefreshToken());
        const { enabled } = store.getState();
        set({ authorized, status: enabled && !authorized ? 'reconnect' : enabled && dirty ? 'pending' : 'idle' });
        // Reprise après redémarrage : une mutation n'a pas été envoyée.
        if (enabled && authorized && dirty) scheduleDebounce();
      })();
    }
    return initPromise;
  };

  /** Un envoi complet. Ne lève jamais : l'issue est publiée dans le store. */
  const attempt = async (accept?: AcceptedRemote | null): Promise<void> => {
    const myEpoch = epoch;
    const gen = generation;
    const stale = () => myEpoch !== epoch || deps.isDecoy();
    if (!provider) return;
    set({ status: 'syncing', error: null });
    let file: Awaited<ReturnType<SyncFileProvider>>;
    try {
      file = await provider();
    } catch (e) {
      if (!stale()) set({ status: 'error', error: errorCode(e) });
      return;
    }
    if (stale()) return;
    if (!file) {
      set({ status: dirty ? 'pending' : 'idle' });
      return;
    }
    const refreshToken = await deps.loadRefreshToken();
    if (stale()) return;
    if (!refreshToken) {
      set({ status: 'reconnect', authorized: false });
      return;
    }
    // Jeton d'accès : variable locale, oubliée à la sortie de ce bloc.
    let token: string | null = null;
    try {
      try {
        token = await deps.refreshAccessToken(refreshToken);
      } catch (e) {
        if (isAuthRejected(e)) {
          // Autorisation perdue : le refresh_token ne vaut plus rien, on l'efface.
          // Pas de navigateur ouvert d'office : l'écran proposera « Reconnecter ».
          await deps.purgeRefreshToken();
          if (!stale()) set({ status: 'reconnect', authorized: false, error: null });
          return;
        }
        throw e;
      }
      if (stale()) return;
      const deviceId = await deps.getDeviceId();
      const known = await deps.readKnown();
      const r = await deps.saveGuarded(token, { content: file.content, deviceId, known, accept });
      if (stale()) return;
      if (r.kind === 'conflict') {
        // Rien n'a été écrit. JAMAIS d'écrasement automatique : l'utilisateur tranche.
        set({ status: 'conflict', conflict: r.conflict });
        return;
      }
      await deps.writeKnown({ id: r.id, rev: r.rev });
      failures = 0;
      if (gen === generation) {
        dirty = false;
        dirtyAt = null;
      }
      const at = new Date(deps.now()).toISOString();
      set({ status: dirty ? 'pending' : 'ok', lastSyncAt: at, error: null, conflict: null });
      persist();
      // Source de vérité locale (centre de sécurité) : posée seulement après un envoi VÉRIFIÉ.
      deps.markBackedUp(file.digest);
    } catch (e) {
      if (stale()) return;
      const code = errorCode(e);
      set({ status: 'error', error: code });
      // Réseau ou vérification MD5 : on réessaie plus tard, rien n'est marqué comme sauvegardé.
      if (code === 'network' || code === 'verify') scheduleRetry();
    } finally {
      token = null;
    }
  };

  const run = (accept?: AcceptedRemote | null): Promise<void> => {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      try {
        let first = true;
        do {
          again = false;
          await attempt(first ? accept : null);
          first = false;
        } while (again && store.getState().enabled && !deps.isDecoy() && !blocked());
      } finally {
        running = null;
      }
    })();
    return running;
  };

  async function syncBackupNow(): Promise<void> {
    if (deps.isDecoy()) return;
    await init();
    if (!store.getState().enabled) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = null;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    await run();
  }

  const markBackupDirty = (_reason: string) => {
    // `_reason` n'est ni journalisé ni persisté : il pourrait nommer un portefeuille.
    if (deps.isDecoy()) return;
    void init().then(() => {
      if (deps.isDecoy() || !store.getState().enabled) return;
      generation += 1;
      dirty = true;
      dirtyAt = deps.now();
      persist();
      if (blocked()) return;
      if (store.getState().status !== 'syncing') set({ status: 'pending' });
      scheduleDebounce();
    });
  };

  const onForeground = () => {
    if (deps.isDecoy()) return;
    void init().then(() => {
      const s = store.getState();
      if (!s.enabled || !dirty || blocked() || running || debounceTimer) return;
      // Retour au premier plan : on n'attend pas la fin d'un délai de réessai.
      void syncBackupNow();
    });
  };

  /** Appelé quand l'autorisation hors ligne vient d'aboutir (retour OAuth). */
  const onAuthorized = async () => {
    if (deps.isDecoy()) return;
    await init();
    const authorized = !!(await deps.loadRefreshToken());
    set({ authorized });
    // Reconnexion d'une synchro déjà active : on reprend tout de suite.
    if (authorized && store.getState().enabled) {
      set({ status: 'pending', error: null });
      dirty = true;
      generation += 1;
      persist();
      await syncBackupNow();
    }
  };

  /** Fin de l'activation (clés locales prêtes) : active et lance le premier envoi. */
  const enableAutoSync = async () => {
    if (deps.isDecoy()) return;
    await init();
    if (!(await deps.loadRefreshToken())) {
      set({ status: 'reconnect', authorized: false });
      throw new Error('no_refresh_token');
    }
    epoch += 1;
    failures = 0;
    dirty = true;
    dirtyAt = deps.now();
    generation += 1;
    set({ enabled: true, authorized: true, status: 'pending', error: null, conflict: null });
    persist();
    await syncBackupNow();
  };

  const replaceRemoteOnConflict = async () => {
    if (deps.isDecoy()) return;
    const { conflict, enabled } = store.getState();
    if (!enabled || !conflict) return;
    // Acceptation liée à CETTE version (id + date) : si elle a changé, nouveau conflit.
    set({ status: 'pending', conflict: null });
    await run(conflict.accept);
  };

  const dismissConflict = () => {
    // Annuler = ne rien écraser maintenant. Le drapeau reste : la prochaine
    // modification (ou « Synchroniser ») reposera la question.
    if (store.getState().status === 'conflict') set({ status: dirty ? 'pending' : 'idle', conflict: null });
  };

  const disableAutoSync = async () => {
    if (deps.isDecoy()) return;
    await init();
    epoch += 1; // un envoi en vol ne publiera plus rien
    clearTimers();
    dirty = false;
    dirtyAt = null;
    failures = 0;
    const refreshToken = await deps.loadRefreshToken();
    // Effacé d'abord : même si la révocation échoue (hors ligne), il n'est plus sur l'appareil.
    await deps.purgeRefreshToken();
    if (refreshToken) {
      await Promise.race([
        deps.revokeToken(refreshToken).catch(() => {}),
        new Promise<void>((r) => setTimeout(r, REVOKE_TIMEOUT_MS)),
      ]);
    }
    await deps.storage.removeItem(STATE_KEY).catch(() => {});
    set({ enabled: false, status: 'idle', error: null, conflict: null, authorized: false, lastSyncAt: null });
    for (const cb of disabledHooks) {
      try {
        await cb();
      } catch {
        /* un crochet en échec n'empêche pas les autres d'effacer leurs clés */
      }
    }
  };

  /** Reset complet du portefeuille : comme une désactivation, plus l'oubli de la version Drive connue. */
  const resetAutoSync = async () => {
    if (deps.isDecoy()) return;
    await disableAutoSync();
    await deps.forgetKnown().catch(() => {});
  };

  return {
    store,
    init,
    registerSyncFileProvider: (p) => {
      provider = p;
      void init();
    },
    markBackupDirty,
    syncBackupNow,
    enableAutoSync,
    onAuthorized,
    replaceRemoteOnConflict,
    dismissConflict,
    onForeground,
    disableAutoSync,
    resetAutoSync,
    onAutoSyncDisabled: (cb) => {
      disabledHooks.push(cb);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Instance de l'app                                                   */
/* ------------------------------------------------------------------ */

const engine = createBackupSyncEngine({
  isDecoy: isDecoySession,
  storage: AsyncStorage,
  loadRefreshToken,
  purgeRefreshToken,
  refreshAccessToken: (rt) => refreshAccessToken(rt),
  revokeToken: (t) => revokeToken(t),
  saveGuarded: (token, opts) => saveBackupGuarded(token, opts),
  getDeviceId,
  readKnown,
  writeKnown,
  forgetKnown,
  // Empreinte du fichier envoyé, fournie avec lui (`null` = « à vérifier », jamais un faux « à jour »).
  markBackedUp: (digest) => useSettings.getState().markEncryptedBackup('drive', digest),
  now: Date.now,
});

let appStateHooked = false;
function hookAppState() {
  if (appStateHooked) return;
  appStateHooked = true;
  try {
    AppState.addEventListener('change', (s) => {
      if (s === 'active') engine.onForeground();
    });
  } catch {
    /* environnement sans AppState (tests, web statique) */
  }
}

export function registerSyncFileProvider(p: SyncFileProvider): void {
  hookAppState();
  engine.registerSyncFileProvider(p);
}

export function markBackupDirty(reason: string): void {
  engine.markBackupDirty(reason);
}

export async function syncBackupNow(): Promise<void> {
  hookAppState();
  await engine.syncBackupNow();
}

export function useBackupSync(): BackupSyncState {
  hookAppState();
  void engine.init();
  return useStore(engine.store);
}

export async function disableAutoSync(): Promise<void> {
  await engine.disableAutoSync();
}

export function onAutoSyncDisabled(cb: () => Promise<void>): void {
  engine.onAutoSyncDisabled(cb);
}

/** À appeler par walletStore.reset (reset complet du portefeuille). */
export async function resetAutoSync(): Promise<void> {
  await engine.resetAutoSync();
}

/**
 * Lance l'autorisation hors ligne (navigateur). Le retour est traité par
 * useDriveFlow.handleRedirect (ui/DeepLinks.tsx), y compris après redémarrage.
 */
export async function startAutoSyncAuth(): Promise<void> {
  if (isDecoySession()) return;
  await useDriveFlow.getState().start({ kind: 'sync' });
}

/** Retour OAuth réussi (refresh_token rangé dans le trousseau). */
export async function onAutoSyncAuthorized(): Promise<void> {
  await engine.onAuthorized();
}

/** Clés locales prêtes (setupAutoSyncKeys) : active la synchro et envoie une première fois. */
export async function enableAutoSync(): Promise<void> {
  hookAppState();
  await engine.enableAutoSync();
}

/** L'utilisateur accepte de remplacer la version en ligne vue lors du conflit. */
export async function replaceRemoteOnConflict(): Promise<void> {
  await engine.replaceRemoteOnConflict();
}

export function dismissSyncConflict(): void {
  engine.dismissConflict();
}
