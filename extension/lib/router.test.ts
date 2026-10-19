import { describe, expect, test } from 'vitest';
import { handleInternal } from './router';
import { makeSession } from './session';
import { makeStore, type StorageArea } from './storage';
import { makeWallets } from './wallets';

function area(): StorageArea {
  const data: Record<string, unknown> = {};
  return {
    async get(keys) { return Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, data[k]])); },
    async set(items) { Object.assign(data, items); },
    async remove(keys) { for (const k of keys) delete data[k]; },
  };
}
const freshSession = () => makeSession({ disk: makeStore(area()), session: makeStore(area()), alarms: { create() {}, clear() {} }, kdf: { N: 1 << 10, r: 8, p: 1 } });

const fresh = () => {
  const s = freshSession();
  return Object.assign(s, { wallets: makeWallets(makeStore(area()), s) });
};
const h = (s: ReturnType<typeof fresh>, m: unknown) => handleInternal(s, s.wallets, m);

describe('routeur interne', () => {
  test('parcours : statut, création, verrouillage, déverrouillage', async () => {
    const s = fresh();
    expect(await h(s, { type: 'vault:status' })).toMatchObject({ ok: true, hasVault: false, unlocked: false });
    expect(await h(s, { type: 'vault:create', password: 'Plage-Orange-47!' })).toEqual({ ok: true });
    expect(await h(s, { type: 'vault:lock' })).toEqual({ ok: true });
    expect(await h(s, { type: 'vault:unlock', password: 'faux-mot-de-passe' })).toEqual({ ok: false, error: 'WRONG_PASSWORD' });
    expect(await h(s, { type: 'vault:unlock', password: 'Plage-Orange-47!' })).toEqual({ ok: true });
  });

  test('requêtes mal formées refusées sans toucher à la session', async () => {
    const s = fresh();
    for (const m of [{ type: 'vault:create' }, { type: 'vault:create', password: 42 }, { type: 'vault:create', password: 'x'.repeat(2000) }, { type: 'vault:unlock', password: '' }]) {
      expect(await h(s, m)).toEqual({ ok: false, error: 'BAD_REQUEST' });
    }
    expect(await h(s, null)).toEqual({ ok: false, error: 'UNKNOWN_MESSAGE' });
    expect(await h(s, { type: 'eth_sendTransaction' })).toEqual({ ok: false, error: 'UNKNOWN_MESSAGE' });
    expect(await h(s, { type: 'vault:status' })).toMatchObject({ hasVault: false });
  });

  test('une erreur inattendue ne laisse rien fuir (ni pile, ni message interne)', async () => {
    const broken = { ...fresh(), status: async () => { throw new Error('/home/secret/path stack'); } };
    expect(await handleInternal(broken as never, broken.wallets, { type: 'vault:status' })).toEqual({ ok: false, error: 'INTERNAL' });
  });
});
