import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeStore, lockSessionToExtension, type StorageArea } from './storage.ts';

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
  assert.deepEqual(Object.keys(area.data), ['kalyx.vault']);
  assert.deepEqual(await s.get('vault'), { v: 1 });
  await s.remove('vault');
  assert.equal(await s.get('vault'), undefined);
});

test('une clé étrangère (sans préfixe) n’est jamais lue', async () => {
  const area = fakeArea();
  area.data['vault'] = 'pas à nous';
  assert.equal(await makeStore(area).get('vault'), undefined);
});

test('zone session : verrouillée sur les contextes de l’extension', async () => {
  let level = '';
  await lockSessionToExtension({ setAccessLevel: async (o) => void (level = o.accessLevel) });
  assert.equal(level, 'TRUSTED_CONTEXTS');
});
