import { beforeEach, describe, expect, test } from 'vitest';
import { makeSession, AUTO_LOCK_ALARM, type Alarms } from './session';
import { makeStore, type StorageArea } from './storage';

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

let disk: ReturnType<typeof area>, mem: ReturnType<typeof area>, alarms: Alarms & { set: Map<string, number> }, clock: number;
const session = () => makeSession({ disk: makeStore(disk), session: makeStore(mem), alarms, now: () => clock, kdf: FAST });

beforeEach(() => {
  disk = area();
  mem = area();
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
    // La clé de session n'apparaît nulle part sur le disque.
    expect(JSON.stringify(disk.data)).not.toContain(mem.data['kalyx.vaultKey'] as string);
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

  test('coffre altéré sur le disque : refusé proprement', async () => {
    const s = session();
    await s.create(PW);
    await s.lock();
    (disk.data['kalyx.vault'] as { kdf: { N: number } }).kdf.N = 1 << 24;
    await expect(s.unlock(PW)).rejects.toThrow('CORRUPTED');
  });
});
