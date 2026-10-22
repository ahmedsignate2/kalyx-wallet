import { beforeEach, describe, expect, test } from 'vitest';
import { CHANGE_NOTICE_MS, makeContacts } from './contacts';
import { makeSession } from './session';
import { makeStore, type StorageArea } from './storage';
import { handleInternal } from './router';
import { makeWallets } from './wallets';

function area(): StorageArea & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = {};
  return {
    data,
    async get(keys) { return Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, structuredClone(data[k])])); },
    async set(items) { Object.assign(data, structuredClone(items)); },
    async remove(keys) { for (const k of keys) delete data[k]; },
  };
}

// Adresses réelles (dérivées de la phrase de test publique « test test … junk »).
const A = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const B = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
/** Sosie de A : mêmes 4 premiers et 4 derniers caractères, milieu différent. */
const A_TWIN = '0xf39f000000000000000000000000000000002266';
const SOL = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
const PW = 'Plage-Orange-47!';

let disk: ReturnType<typeof area>;
let clock = 1_000_000;
let session: ReturnType<typeof makeSession>;
beforeEach(async () => {
  disk = area();
  clock = 1_000_000;
  session = makeSession({ disk: makeStore(disk), session: makeStore(area()), alarms: { create() {}, clear() {} }, kdf: { N: 1 << 10, r: 8, p: 1 } });
  await session.create(PW);
});
const make = () => makeContacts(makeStore(disk), session, () => clock);
const code = (p: Promise<unknown>) => p.then(() => 'ok', (e: Error & { params?: Record<string, string> }) => `${e.message}${e.params?.name ? `:${e.params.name}` : ''}`);

describe('carnet d’adresses', () => {
  test('ajout EVM et Solana, trié par nom, scellé sur le disque', async () => {
    const c = make();
    await c.add('Zoé', A.toLowerCase());
    await c.add('Ali', SOL);
    const list = await c.list();
    expect(list.map((x) => [x.name, x.family])).toEqual([['Ali', 'solana'], ['Zoé', 'evm']]);
    // Somme de contrôle EVM rétablie.
    expect(list[1].address).toBe(A);
    const raw = JSON.stringify(disk.data);
    expect(raw).not.toContain('Zoé');
    expect(raw.toLowerCase()).not.toContain(A.toLowerCase());
  });

  test('refus : adresse invalide, nom vide, doublon (même casse différente)', async () => {
    const c = make();
    expect(await code(c.add('X', '0x1234'))).toBe('INVALID_ADDRESS');
    expect(await code(c.add('  ‮ ', A))).toBe('BAD_LABEL');
    await c.add('Léa', A);
    expect(await code(c.add('Autre', A.toLowerCase()))).toBe('CONTACT_EXISTS:Léa');
  });

  test('nom nettoyé : contrôles et bidi retirés, 40 caractères', async () => {
    const c = await make().add(`Lé\u0000a‮ ${'x'.repeat(60)}`, B);
    expect(c.name).toBe(`Léa ${'x'.repeat(36)}`);
  });

  test('sosie d’un contact : refusé sans confirmation explicite', async () => {
    const c = make();
    await c.add('Léa', A);
    expect(await code(c.add('Faux', A_TWIN))).toBe('CONTACT_LOOKALIKE:Léa');
    expect((await c.list()).length).toBe(1);
    await c.add('Faux', A_TWIN, true);
    expect((await c.list()).length).toBe(2);
  });

  test('changer l’adresse : confirmation exigée, puis signalé 30 jours', async () => {
    const c = make();
    const lea = await c.add('Léa', A);
    // Renommer seul : pas de confirmation, pas de signal.
    expect((await c.update(lea.id, 'Léa M.', A)).recentlyChanged).toBe(false);
    expect(await code(c.update(lea.id, 'Léa M.', B))).toBe('CONTACT_ADDRESS_CHANGE');
    const moved = await c.update(lea.id, 'Léa M.', B, { confirmChange: true });
    expect(moved).toMatchObject({ address: B, previous: A, changedAt: clock, recentlyChanged: true });
    clock += CHANGE_NOTICE_MS + 1;
    expect((await c.list())[0].recentlyChanged).toBe(false);
  });

  test('une confirmation de changement ne vaut pas confirmation de sosie', async () => {
    const c = make();
    await c.add('Léa', A);
    const bob = await c.add('Bob', B);
    expect(await code(c.update(bob.id, 'Bob', A_TWIN, { confirmChange: true }))).toBe('CONTACT_LOOKALIKE:Léa');
    expect((await c.list()).find((x) => x.id === bob.id)?.address).toBe(B);
  });

  test('changer le mot de passe du coffre ne perd pas le carnet', async () => {
    const c = make();
    await c.add('Léa', A);
    await session.changePassword(PW, 'Autre-Mot-De-Passe-91!');
    expect((await c.list()).map((x) => x.name)).toEqual(['Léa']);
  });

  test('suppression ; contact inconnu', async () => {
    const c = make();
    const x = await c.add('Léa', A);
    await c.remove(x.id);
    expect(await c.list()).toEqual([]);
    expect(await code(c.remove(x.id))).toBe('UNKNOWN_CONTACT');
  });

  test('carnet modifié à la main : illisible, jamais écrasé en silence', async () => {
    const c = make();
    await c.add('Léa', A);
    const k = Object.keys(disk.data).find((x) => x.endsWith('contacts'))!;
    const sealed = disk.data[k] as Record<string, string>;
    disk.data[k] = { ...sealed, ct: sealed.ct.replace(/^./, (ch) => (ch === '0' ? '1' : '0')) };
    expect(await code(c.list())).toBe('CONTACTS_UNREADABLE');
    expect(await code(c.add('Bob', B))).toBe('CONTACTS_UNREADABLE');
  });

  test('verrouillé : rien ne se lit ni ne s’écrit (routeur)', async () => {
    const c = make();
    await c.add('Léa', A);
    await session.lock();
    const wallets = makeWallets(makeStore(disk), session);
    for (const m of [{ type: 'contacts:list' }, { type: 'contacts:add', name: 'Bob', address: B }, { type: 'contacts:remove', id: 'x' }]) {
      expect(await handleInternal(session, wallets, m, undefined, { contacts: c })).toMatchObject({ ok: false, error: 'LOCKED' });
    }
    await session.unlock(PW);
    expect(await handleInternal(session, wallets, { type: 'contacts:add', name: 'Faux', address: A_TWIN }, undefined, { contacts: c })).toEqual({ ok: false, error: 'CONTACT_LOOKALIKE', params: { name: 'Léa' } });
  });
});
