/*
 * Moteur de synchro : logique pure, horloge simulée, dépendances injectées.
 * Les modules natifs sont neutralisés : seul `createBackupSyncEngine` est testé.
 */
jest.mock('react-native', () => ({ AppState: { addEventListener: jest.fn() } }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined },
}));
jest.mock('./googleDrive', () => ({}));
jest.mock('./settingsStore', () => ({ useSettings: { getState: () => ({ markEncryptedBackup: jest.fn() }) } }));
jest.mock('./deviceId', () => ({ getDeviceId: async () => 'dev' }));

import { createBackupSyncEngine, retryDelay, SYNC_DEBOUNCE_MS, type SyncDeps } from './backupSync';
import { DriveError, DriveVerifyError, type GuardedSaveResult } from '../src/domain/backup/drive';

const CONFLICT: GuardedSaveResult = {
  kind: 'conflict',
  conflict: { remoteCount: 3, localCount: 1, modifiedTime: '2026-01-01T00:00:00Z', sameDevice: false, accept: { id: 'f1', modifiedTime: '2026-01-01T00:00:00Z' } },
};

function setup(over: Partial<SyncDeps> = {}, persisted?: object) {
  const mem = new Map<string, string>();
  if (persisted) mem.set('kalyx.backupSync.state', JSON.stringify(persisted));
  let refresh: string | null = 'rt';
  let rev = 0;
  const base = {
    isDecoy: jest.fn(() => false),
    storage: {
      getItem: jest.fn(async (k: string) => mem.get(k) ?? null),
      setItem: jest.fn(async (k: string, v: string) => void mem.set(k, v)),
      removeItem: jest.fn(async (k: string) => void mem.delete(k)),
    },
    loadRefreshToken: jest.fn(async () => refresh),
    purgeRefreshToken: jest.fn(async () => {
      refresh = null;
    }),
    refreshAccessToken: jest.fn(async (_rt: string) => 'access'),
    revokeToken: jest.fn(async (_t: string) => {}),
    saveGuarded: jest.fn(async (_t: string, _o: { accept?: unknown }): Promise<GuardedSaveResult> => ({ kind: 'saved', id: `f${++rev}`, rev, modifiedTime: 'x' })),
    getDeviceId: jest.fn(async () => 'dev'),
    readKnown: jest.fn(async () => null),
    writeKnown: jest.fn(async () => {}),
    forgetKnown: jest.fn(async () => {}),
    markBackedUp: jest.fn(),
    now: () => Date.now(),
  };
  // Les surcharges restent des jest.fn : on garde le type des maquettes.
  const deps = { ...base, ...over } as typeof base;
  const engine = createBackupSyncEngine(deps as SyncDeps);
  const provider = jest.fn(async (): Promise<{ content: string; count: number; digest: string | null } | null> => ({ content: '{"count":1}', count: 1, digest: 'd1' }));
  engine.registerSyncFileProvider(provider);
  return { engine, deps, provider, mem };
}

/** Active la synchro et laisse passer le premier envoi. */
async function enabled(over: Partial<SyncDeps> = {}) {
  const s = setup(over);
  await s.engine.enableAutoSync();
  s.deps.saveGuarded.mockClear();
  s.deps.markBackedUp.mockClear();
  return s;
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('délai croissant : 30 s, 1 min, 2 min… plafonné à 1 h', () => {
  expect(retryDelay(1)).toBe(30_000);
  expect(retryDelay(2)).toBe(60_000);
  expect(retryDelay(3)).toBe(120_000);
  expect(retryDelay(20)).toBe(3_600_000);
});

it('activation : premier envoi, statut ok, sauvegarde marquée', async () => {
  const { engine, deps } = setup();
  await engine.enableAutoSync();
  expect(deps.saveGuarded).toHaveBeenCalledTimes(1);
  expect(deps.saveGuarded.mock.calls[0][0]).toBe('access');
  expect(deps.writeKnown).toHaveBeenCalledWith({ id: 'f1', rev: 1 });
  expect(deps.markBackedUp).toHaveBeenCalledTimes(1);
  // L'empreinte enregistrée est celle du fichier envoyé, pas une empreinte globale.
  expect(deps.markBackedUp).toHaveBeenCalledWith('d1');
  expect(engine.store.getState()).toMatchObject({ enabled: true, status: 'ok', error: null });
  expect(engine.store.getState().lastSyncAt).not.toBeNull();
});

it('debounce : 5 marquages → 1 seul envoi', async () => {
  const { engine, deps } = await enabled();
  for (let i = 0; i < 5; i++) {
    engine.markBackupDirty('x');
    await jest.advanceTimersByTimeAsync(1_000);
  }
  expect(deps.saveGuarded).not.toHaveBeenCalled();
  expect(engine.store.getState().status).toBe('pending');
  await jest.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS);
  expect(deps.saveGuarded).toHaveBeenCalledTimes(1);
  expect(engine.store.getState().status).toBe('ok');
});

it('mutex : un envoi à la fois ; un marquage pendant l’envoi en déclenche un second, après', async () => {
  let release!: () => void;
  let active = 0;
  let maxActive = 0;
  let n = 0;
  const { engine, deps } = await enabled();
  deps.saveGuarded.mockImplementation(async () => {
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise<void>((r) => (release = r));
    active--;
    n++;
    return { kind: 'saved', id: `g${n}`, rev: n, modifiedTime: 'x' };
  });
  const first = engine.syncBackupNow();
  await jest.advanceTimersByTimeAsync(0);
  engine.markBackupDirty('pendant');
  void engine.syncBackupNow(); // appel explicite pendant l'envoi : rejoint, ne double pas
  await jest.advanceTimersByTimeAsync(0);
  expect(deps.saveGuarded).toHaveBeenCalledTimes(1);
  release();
  await jest.advanceTimersByTimeAsync(0);
  // Le second envoi (demandé pendant le premier) démarre APRÈS.
  expect(deps.saveGuarded).toHaveBeenCalledTimes(2);
  release();
  await first;
  await jest.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS);
  if (deps.saveGuarded.mock.calls.length > 2) release();
  await jest.advanceTimersByTimeAsync(0);
  expect(maxActive).toBe(1);
  // Le marquage pendant le 1er envoi est couvert : le drapeau est retombé.
  expect(engine.store.getState().status).toBe('ok');
});

it('erreur réseau : nouvelles tentatives à délai croissant, puis succès', async () => {
  const { engine, deps } = await enabled();
  deps.saveGuarded
    .mockRejectedValueOnce(new TypeError('Network request failed'))
    .mockRejectedValueOnce(new DriveError('busy', 503));
  engine.markBackupDirty('x');
  await jest.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS);
  expect(deps.saveGuarded).toHaveBeenCalledTimes(1);
  expect(engine.store.getState()).toMatchObject({ status: 'error', error: 'network' });
  await jest.advanceTimersByTimeAsync(29_000);
  expect(deps.saveGuarded).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(1_000); // 30 s
  expect(deps.saveGuarded).toHaveBeenCalledTimes(2);
  await jest.advanceTimersByTimeAsync(59_000);
  expect(deps.saveGuarded).toHaveBeenCalledTimes(2);
  await jest.advanceTimersByTimeAsync(1_000); // 60 s
  expect(deps.saveGuarded).toHaveBeenCalledTimes(3);
  expect(engine.store.getState().status).toBe('ok');
  expect(deps.markBackedUp).toHaveBeenCalledTimes(1);
});

it('échec MD5 : erreur, rien de marqué, nouvelle tentative plus tard', async () => {
  const { engine, deps } = await enabled();
  deps.saveGuarded.mockRejectedValueOnce(new DriveVerifyError());
  await engine.syncBackupNow();
  expect(engine.store.getState()).toMatchObject({ status: 'error', error: 'verify' });
  expect(deps.markBackedUp).not.toHaveBeenCalled();
  expect(deps.writeKnown).toHaveBeenCalledTimes(1); // seulement celui de l'activation
  await jest.advanceTimersByTimeAsync(30_000);
  expect(deps.saveGuarded).toHaveBeenCalledTimes(2);
  expect(deps.markBackedUp).toHaveBeenCalledTimes(1);
});

it.each([
  ['invalid_grant', Object.assign(new Error('x'), { code: 'invalid_grant' })],
  ['401', Object.assign(new Error('401'), { code: 'invalid_grant' })],
])('refresh refusé (%s) → reconnect, jeton purgé, aucun envoi, aucun réessai', async (_n, err) => {
  const { engine, deps } = await enabled();
  deps.refreshAccessToken.mockRejectedValueOnce(err);
  await engine.syncBackupNow();
  expect(deps.purgeRefreshToken).toHaveBeenCalledTimes(1);
  expect(deps.saveGuarded).not.toHaveBeenCalled();
  expect(engine.store.getState()).toMatchObject({ status: 'reconnect', authorized: false });
  // Les mutations suivantes n'envoient rien tant que l'utilisateur ne s'est pas reconnecté.
  engine.markBackupDirty('x');
  await jest.advanceTimersByTimeAsync(RETRY_SAFE);
  expect(deps.refreshAccessToken).toHaveBeenCalledTimes(2); // activation + celui-ci
  expect(deps.saveGuarded).not.toHaveBeenCalled();
});
const RETRY_SAFE = 2 * 3_600_000;

it('conflit → statut conflit, AUCUN écrasement ; remplacer n’accepte que la version vue', async () => {
  const { engine, deps } = await enabled();
  deps.saveGuarded.mockResolvedValueOnce(CONFLICT);
  await engine.syncBackupNow();
  expect(engine.store.getState().status).toBe('conflict');
  expect(deps.saveGuarded.mock.calls[0][1].accept ?? null).toBeNull();
  expect(deps.markBackedUp).not.toHaveBeenCalled();
  // Rien ne repart seul : ni marquage, ni temps qui passe.
  engine.markBackupDirty('x');
  await jest.advanceTimersByTimeAsync(RETRY_SAFE);
  expect(deps.saveGuarded).toHaveBeenCalledTimes(1);
  await engine.replaceRemoteOnConflict();
  expect(deps.saveGuarded).toHaveBeenCalledTimes(2);
  expect(deps.saveGuarded.mock.calls[1][1].accept).toEqual(CONFLICT.kind === 'conflict' ? CONFLICT.conflict.accept : null);
  expect(engine.store.getState().status).toBe('ok');
});

it('session leurre : aucun appel réseau, aucune écriture', async () => {
  const { engine, deps } = await enabled();
  deps.storage.setItem.mockClear();
  deps.loadRefreshToken.mockClear();
  deps.isDecoy.mockReturnValue(true);
  engine.markBackupDirty('x');
  await engine.syncBackupNow();
  engine.onForeground();
  await engine.disableAutoSync();
  await jest.advanceTimersByTimeAsync(RETRY_SAFE);
  expect(deps.saveGuarded).not.toHaveBeenCalled();
  expect(deps.refreshAccessToken).toHaveBeenCalledTimes(1); // activation seulement
  expect(deps.loadRefreshToken).not.toHaveBeenCalled();
  expect(deps.revokeToken).not.toHaveBeenCalled();
  expect(deps.storage.setItem).not.toHaveBeenCalled();
  expect(deps.storage.removeItem).not.toHaveBeenCalled();
});

it('désactivation : révocation + effacement du jeton et de l’état + crochets', async () => {
  const { engine, deps, mem } = await enabled();
  const hook = jest.fn(async () => {});
  engine.onAutoSyncDisabled(hook);
  engine.markBackupDirty('x');
  await engine.disableAutoSync();
  expect(deps.revokeToken).toHaveBeenCalledWith('rt');
  expect(deps.purgeRefreshToken).toHaveBeenCalled();
  expect(mem.has('kalyx.backupSync.state')).toBe(false);
  expect(hook).toHaveBeenCalledTimes(1);
  expect(engine.store.getState()).toMatchObject({ enabled: false, authorized: false, status: 'idle' });
  await jest.advanceTimersByTimeAsync(RETRY_SAFE);
  expect(deps.saveGuarded).not.toHaveBeenCalled();
});

it('désactivation hors ligne : ne bloque pas sur la révocation', async () => {
  const { engine, deps } = await enabled({ revokeToken: jest.fn(() => new Promise<void>(() => {})) });
  const p = engine.disableAutoSync();
  await jest.advanceTimersByTimeAsync(5_000);
  await p;
  expect(deps.purgeRefreshToken).toHaveBeenCalled();
  expect(engine.store.getState().enabled).toBe(false);
});

it('reprise après redémarrage : drapeau sale persisté → envoi', async () => {
  const { engine, deps } = setup({}, { enabled: true, dirty: true, dirtyAt: 1, lastSyncAt: null });
  await engine.init();
  expect(engine.store.getState().status).toBe('pending');
  await jest.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS);
  expect(deps.saveGuarded).toHaveBeenCalledTimes(1);
  expect(engine.store.getState().status).toBe('ok');
});

it('fournisseur null : rien n’est envoyé', async () => {
  const { engine, deps, provider } = await enabled();
  provider.mockResolvedValueOnce(null as never);
  await engine.syncBackupNow();
  expect(deps.refreshAccessToken).toHaveBeenCalledTimes(1);
  expect(deps.saveGuarded).not.toHaveBeenCalled();
});
