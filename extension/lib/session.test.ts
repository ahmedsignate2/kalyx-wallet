import { beforeEach, describe, expect, test } from 'vitest';
import { makeSession, AUTO_LOCK_ALARM, type Alarms } from './session';
import { makeStore, type StorageArea } from './storage';
import { makeKeyBox, memoryWrapStore, type WrapKeyStore } from './keyBox';

const FAST = { N: 1 << 10, r: 8, p: 1 };
const PW = 'Plage-Orange-47!';

function area(): StorageArea & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = {};
  return {
    data,
    async get(keys) { return Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, structuredClone(data[k])])); },
    async set(items) { Object.assign(data, structuredClone(items)); },
    async remove(keys) { for (const k of keys) delete data[k]; },
  };
}

let disk: ReturnType<typeof area>, mem: ReturnType<typeof area>, alarms: Alarms & { set: Map<string, number> }, clock: number, idb: WrapKeyStore;
// Chaque appel = une instance du service worker ; `idb` joue IndexedDB (survit aux redémarrages).
const session = () => makeSession({ disk: makeStore(disk), session: makeStore(mem), alarms, now: () => clock, kdf: FAST, box: makeKeyBox(idb) });

beforeEach(() => {
  disk = area();
  mem = area();
  idb = memoryWrapStore();
  clock = 1_000_000;
  const set = new Map<string, number>();
  alarms = { set, create: (n, i) => void set.set(n, i.delayInMinutes), clear: (n) => set.delete(n) };
});

describe('session de l’extension', () => {
  test('créer : coffre sur le disque, clé en session seulement, minuteur armé (15 min)', async () => {
    const s = session();
    await s.create(PW);
    expect(await s.status()).toMatchObject({ hasVault: true, unlocked: true, autoLockMin: 15 });
    expect(Object.keys(disk.data)).toEqual(['kalyx.vault']);
    expect(Object.keys(mem.data)).toEqual(['kalyx.vaultKey']);
    // En session : un bloc scellé (48 octets chiffrés), jamais la clé en clair.
    expect(mem.data['kalyx.vaultKey']).toMatchObject({ n: expect.stringMatching(/^[0-9a-f]{24}$/), ct: expect.stringMatching(/^[0-9a-f]{96}$/) });
    const raw = await s.vaultKey();
    const hex = Buffer.from(raw).toString('hex');
    expect(JSON.stringify(mem.data)).not.toContain(hex);
    expect(JSON.stringify(disk.data)).not.toContain(hex);
    expect(alarms.set.get(AUTO_LOCK_ALARM)).toBe(15);
  });

  test('mot de passe faible refusé, coffre unique', async () => {
    const s = session();
    await expect(s.create('12345678')).rejects.toThrow('WEAK_PASSWORD');
    await expect(s.create('password')).rejects.toThrow('WEAK_PASSWORD');
    await s.create(PW);
    await expect(s.create('Autre-Mot-De-Passe-9')).rejects.toThrow('VAULT_EXISTS');
  });

  test('verrouiller efface la clé et le minuteur ; rouvrir la remet', async () => {
    const s = session();
    await s.create(PW);
    await s.lock();
    expect(await s.status()).toMatchObject({ unlocked: false });
    expect(mem.data).toEqual({});
    expect(alarms.set.has(AUTO_LOCK_ALARM)).toBe(false);
    await expect(s.vaultKey()).rejects.toThrow('LOCKED');
    await s.unlock(PW);
    expect((await s.vaultKey()).length).toBe(32);
  });

  test('freinage : 5 erreurs → 30 s d’attente, puis le double ; vérifié AVANT le calcul', async () => {
    const s = session();
    await s.create(PW);
    await s.lock();
    for (let i = 0; i < 4; i++) await expect(s.unlock('mauvais-mot-de-passe')).rejects.toThrow('WRONG_PASSWORD');
    await expect(s.unlock('mauvais-mot-de-passe')).rejects.toMatchObject({ message: 'WRONG_PASSWORD', waitMs: 30_000 });
    // Même le BON mot de passe attend : le freinage ne dit rien de sa justesse.
    await expect(s.unlock(PW)).rejects.toMatchObject({ message: 'THROTTLED', waitMs: 30_000 });
    clock += 30_000;
    await expect(s.unlock('mauvais-mot-de-passe')).rejects.toMatchObject({ waitMs: 60_000 });
    clock += 60_000;
    await s.unlock(PW);
    expect((await s.status()).waitMs).toBe(0);
  });

  test('rafale de 10 essais simultanés : le freinage n’est pas contourné', async () => {
    const s = session();
    await s.create(PW);
    await s.lock();
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => s.unlock('mauvais-mot-de-passe')));
    const codes = results.map((r) => (r as PromiseRejectedResult).reason.message);
    expect(codes.filter((c) => c === 'WRONG_PASSWORD')).toHaveLength(5);
    expect(codes.filter((c) => c === 'THROTTLED')).toHaveLength(5);
  });

  test('changer de mot de passe', async () => {
    const s = session();
    await s.create(PW);
    await expect(s.changePassword('mauvais', 'Nouveau-Mot-2026!')).rejects.toThrow('WRONG_PASSWORD');
    await expect(s.changePassword(PW, 'faible')).rejects.toThrow('WEAK_PASSWORD');
    await s.changePassword(PW, 'Nouveau-Mot-2026!');
    await s.lock();
    await expect(s.unlock(PW)).rejects.toThrow('WRONG_PASSWORD');
    await s.unlock('Nouveau-Mot-2026!');
  });

  test('auto-verrouillage réglable (valeurs proposées seulement) ; l’activité relance le minuteur', async () => {
    const s = session();
    await s.create(PW);
    await s.setAutoLock(5);
    expect(alarms.set.get(AUTO_LOCK_ALARM)).toBe(5);
    await expect(s.setAutoLock(0)).rejects.toThrow('BAD_SETTING');
    await expect(s.setAutoLock(10_000)).rejects.toThrow('BAD_SETTING');
    alarms.set.clear();
    await s.touch();
    expect(alarms.set.get(AUTO_LOCK_ALARM)).toBe(5);
    await s.lock();
    alarms.set.clear();
    await s.touch(); // verrouillé : rien à relancer
    expect(alarms.set.size).toBe(0);
  });

  test('redémarrage du service worker : une NOUVELLE instance retrouve la session (zone session)', async () => {
    await session().create(PW);
    expect(await session().status()).toMatchObject({ unlocked: true });
  });

  test('mode parano : la clé d’emballage ne survit pas à l’arrêt du service worker', async () => {
    const a = session();
    await a.create(PW);
    await a.setParanoid(true);
    expect(await idb.get()).toBeNull();
    expect(await a.status()).toMatchObject({ unlocked: true, paranoid: true });
    // Nouvelle instance (service worker redémarré) : bloc présent mais inutilisable → verrouillé, bloc effacé.
    const b = session();
    expect(await b.status()).toMatchObject({ unlocked: false });
    expect(mem.data['kalyx.vaultKey']).toBeUndefined();
    await expect(b.vaultKey()).rejects.toThrow('LOCKED');
    // Déverrouillé en parano : rien dans IndexedDB ; mode coupé en cours de session : W y revient.
    await b.unlock(PW);
    expect(await idb.get()).toBeNull();
    await b.setParanoid(false);
    expect(await idb.get()).not.toBeNull();
    expect(await session().status()).toMatchObject({ unlocked: true, paranoid: false });
  });

  test('ancien format (clé en hexadécimal) ou bloc altéré : session fermée, jamais acceptée', async () => {
    const s = session();
    await s.create(PW);
    mem.data['kalyx.vaultKey'] = 'ab'.repeat(32);
    expect(await s.status()).toMatchObject({ unlocked: false });
    await s.unlock(PW);
    const b = mem.data['kalyx.vaultKey'] as { n: string; ct: string };
    mem.data['kalyx.vaultKey'] = { ...b, ct: (b.ct[0] === '0' ? '1' : '0') + b.ct.slice(1) };
    await expect(s.vaultKey()).rejects.toThrow('LOCKED');
    expect(await s.status()).toMatchObject({ unlocked: false });
  });

  test('verrouiller efface aussi la clé d’emballage', async () => {
    const s = session();
    await s.create(PW);
    expect(await idb.get()).not.toBeNull();
    await s.lock();
    expect(await idb.get()).toBeNull();
    await expect(s.setParanoid('oui')).rejects.toThrow('BAD_SETTING');
  });

  test('coffre altéré sur le disque : refusé proprement', async () => {
    const s = session();
    await s.create(PW);
    await s.lock();
    (disk.data['kalyx.vault'] as { kdf: { N: number } }).kdf.N = 1 << 24;
    await expect(s.unlock(PW)).rejects.toThrow('CORRUPTED');
  });
});
