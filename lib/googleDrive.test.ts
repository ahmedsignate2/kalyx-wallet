/*
 * Refresh_token orphelin : autorisation Google obtenue pour la synchro mais
 * activation jamais terminée. Modules natifs neutralisés.
 */
const mem = new Map<string, string>();
const keychain = new Map<string, string>();
jest.mock('expo-linking', () => ({ openURL: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (k: string) => mem.get(k) ?? null,
    setItem: async (k: string, v: string) => void mem.set(k, v),
    removeItem: async (k: string) => void mem.delete(k),
  },
}));
jest.mock('./kv', () => ({
  KV_DEVICE_ONLY: {},
  kvGet: async (k: string) => keychain.get(k) ?? null,
  kvSet: async (k: string, v: string) => void keychain.set(k, v),
  kvDel: async (k: string) => void keychain.delete(k),
}));
jest.mock('./settingsStore', () => ({ useSettings: { getState: () => ({}) } }));
jest.mock('./deviceId', () => ({ getDeviceId: async () => 'dev' }));

import { isSyncAuthOrphan, purgeOrphanSyncAuth, SYNC_AUTH_PENDING_TTL_MS } from './googleDrive';

const NOW = 1_800_000_000_000;
const RT = 'kalyx.drive.refreshToken';
const PENDING = 'kalyx.drive.syncAuthPending';
let fetchMock: jest.Mock;

beforeEach(() => {
  mem.clear();
  keychain.clear();
  fetchMock = jest.fn(async () => ({ ok: true }));
  (globalThis as { fetch?: unknown }).fetch = fetchMock;
});

it('témoin : absent = pas orphelin ; expiré ou illisible = orphelin', () => {
  expect(isSyncAuthOrphan(null, NOW)).toBe(false);
  expect(isSyncAuthOrphan(String(NOW - 60_000), NOW)).toBe(false);
  expect(isSyncAuthOrphan(String(NOW - SYNC_AUTH_PENDING_TTL_MS - 1), NOW)).toBe(true);
  expect(isSyncAuthOrphan('n/a', NOW)).toBe(true);
});

it('activation abandonnée depuis > 15 min : jeton révoqué et purgé', async () => {
  keychain.set(RT, 'rt');
  mem.set(PENDING, String(NOW - SYNC_AUTH_PENDING_TTL_MS - 1));
  await purgeOrphanSyncAuth(NOW);
  expect(keychain.has(RT)).toBe(false);
  expect(mem.has(PENDING)).toBe(false);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(String(fetchMock.mock.calls[0][0])).toContain('revoke?token=rt');
});

it('activation en cours (< 15 min) : rien n’est touché', async () => {
  keychain.set(RT, 'rt');
  mem.set(PENDING, String(NOW - 60_000));
  await purgeOrphanSyncAuth(NOW);
  expect(keychain.get(RT)).toBe('rt');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('synchro active (reconnexion) : jeton légitime gardé, témoin effacé', async () => {
  keychain.set(RT, 'rt');
  mem.set(PENDING, String(NOW - SYNC_AUTH_PENDING_TTL_MS - 1));
  mem.set('kalyx.backupSync.state', JSON.stringify({ enabled: true }));
  await purgeOrphanSyncAuth(NOW);
  expect(keychain.get(RT)).toBe('rt');
  expect(mem.has(PENDING)).toBe(false);
  expect(fetchMock).not.toHaveBeenCalled();
});
