import { describe, expect, test } from 'vitest';
import { handleInternal } from './router';
import { makeSession } from './session';
import { makeStore, type StorageArea } from './storage';
import { makeWallets } from './wallets';
import { makeAssets } from './assets';
import { makeNfts } from './nfts';
import { RESET_CONFIRM } from './policy';

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

  test('réseaux, tokens et NFT : verrouillé, rien ne se lit ni ne change', async () => {
    const s = fresh();
    await h(s, { type: 'vault:create', password: 'Plage-Orange-47!' });
    await h(s, { type: 'vault:lock' });
    const disk = makeStore(area());
    const svc = { assets: makeAssets({ disk }), nfts: makeNfts({ disk }), home: { current: async () => null } as never };
    for (const m of [
      { type: 'assets:networks' },
      { type: 'assets:set-network', id: 'polygon', hidden: true },
      { type: 'assets:set-token', id: 'base:native', hidden: true },
      { type: 'tokens:check', chainId: 'base', contract: '0x1111111111111111111111111111111111111111' },
      { type: 'tokens:add', chainId: 'base', contract: '0x1111111111111111111111111111111111111111' },
      { type: 'tokens:remove', chainId: 'base', contract: '0x1111111111111111111111111111111111111111' },
      { type: 'nfts:get', fresh: true },
    ]) {
      expect(await handleInternal(s, s.wallets, m, undefined, svc)).toEqual({ ok: false, error: 'LOCKED' });
    }
    expect(await disk.get('view.prefs')).toBeUndefined();
  });

  test('échange : verrouillé refusé ; « redemander le mot de passe » vaut aussi pour un échange', async () => {
    const s = fresh();
    await h(s, { type: 'vault:create', password: 'Plage-Orange-47!' });
    const disk = makeStore(area());
    let signed = 0;
    const swap = { confirm: async () => ((signed += 1), { txid: '0x1' }), sources: async () => [], targets: async () => [], quote: async () => ({}), stage: () => null } as never;
    await disk.set('askPasswordToSign', true);
    const call = (m: unknown) => handleInternal(s, s.wallets, m, undefined, { swap, disk });
    expect(await call({ type: 'swap:confirm', id: 'x' })).toEqual({ ok: false, error: 'PASSWORD_REQUIRED' });
    expect(await call({ type: 'swap:confirm', id: 'x', password: 'faux-mot-de-passe' })).toMatchObject({ ok: false, error: 'WRONG_PASSWORD' });
    expect(signed).toBe(0);
    expect(await call({ type: 'swap:confirm', id: 'x', password: 'Plage-Orange-47!' })).toEqual({ ok: true, txid: '0x1' });
    await h(s, { type: 'vault:lock' });
    expect(await call({ type: 'swap:quote', from: 'x' })).toEqual({ ok: false, error: 'LOCKED' });
    expect(await call({ type: 'swap:confirm', id: 'x', password: 'Plage-Orange-47!' })).toEqual({ ok: false, error: 'LOCKED' });
  });

  test('langue : réglable verrouillé, seulement une des 15 ; null rend celle du navigateur', async () => {
    const s = fresh();
    const disk = makeStore(area());
    const go = (m: unknown) => handleInternal(s, s.wallets, m, undefined, { disk });
    expect(await go({ type: 'settings:get-lang' })).toEqual({ ok: true, lang: null });
    for (const lang of ['xx', 'FR', 42, undefined, '__proto__']) expect(await go({ type: 'settings:set-lang', lang })).toEqual({ ok: false, error: 'BAD_REQUEST' });
    expect(await go({ type: 'settings:set-lang', lang: 'ja' })).toEqual({ ok: true });
    expect(await go({ type: 'settings:get-lang' })).toEqual({ ok: true, lang: 'ja' });
    expect(await go({ type: 'settings:set-lang', lang: null })).toEqual({ ok: true });
    expect(await go({ type: 'settings:get-lang' })).toEqual({ ok: true, lang: null });
  });

  test('mot de passe oublié : tout effacer exige le code exact, jamais par défaut', async () => {
    const s = fresh();
    let resets = 0;
    const go = (m: unknown) => handleInternal(s, s.wallets, m, undefined, { reset: async () => void resets++ });
    for (const confirm of [undefined, true, 'erase', `${RESET_CONFIRM} `]) expect(await go({ type: 'vault:reset', confirm })).toEqual({ ok: false, error: 'BAD_REQUEST' });
    expect(resets).toBe(0);
    expect(await go({ type: 'vault:reset', confirm: RESET_CONFIRM })).toEqual({ ok: true });
    expect(resets).toBe(1);
    // Sans service de réinitialisation (fenêtre d'approbation, tests) : refusé.
    expect(await h(s, { type: 'vault:reset', confirm: RESET_CONFIRM })).toEqual({ ok: false, error: 'BAD_REQUEST' });
  });


  test('mode parano : verrouillé, refusé ; valeur non booléenne refusée', async () => {
    const s = fresh();
    expect(await h(s, { type: 'vault:set-paranoid', on: true })).toEqual({ ok: false, error: 'LOCKED' });
    await h(s, { type: 'vault:create', password: 'Plage-Orange-47!' });
    expect(await h(s, { type: 'vault:set-paranoid', on: 'oui' })).toEqual({ ok: false, error: 'BAD_SETTING' });
    expect(await h(s, { type: 'vault:set-paranoid', on: true })).toEqual({ ok: true });
    expect(await h(s, { type: 'vault:status' })).toMatchObject({ unlocked: true, paranoid: true });
  });

});
