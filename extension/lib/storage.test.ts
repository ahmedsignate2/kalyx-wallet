import { test, expect } from 'vitest';
import { makeStore, lockSessionToExtension, type StorageArea } from './storage';

function fakeArea(): StorageArea & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = {};
  return {
    data,
    async get(keys) {
      return Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, data[k]]));
    },
    async set(items) {
      Object.assign(data, items);
    },
    async remove(keys) {
      for (const k of keys) delete data[k];
    },
  };
}

test('écrit, relit et efface sous un préfixe propre à Kalyx', async () => {
  const area = fakeArea();
  const s = makeStore(area);
  await s.set('vault', { v: 1 });
  expect(Object.keys(area.data)).toEqual(['kalyx.vault']);
  expect(await s.get('vault')).toEqual({ v: 1 });
  await s.remove('vault');
  expect(await s.get('vault')).toBe(undefined);
});

test('une clé étrangère (sans préfixe) n’est jamais lue', async () => {
  const area = fakeArea();
  area.data['vault'] = 'pas à nous';
  expect(await makeStore(area).get('vault')).toBe(undefined);
});

test('zone session : verrouillée sur les contextes de l’extension', async () => {
  let level = '';
  await lockSessionToExtension({ setAccessLevel: async (o) => void (level = o.accessLevel) });
  expect(level).toBe('TRUSTED_CONTEXTS');
});
