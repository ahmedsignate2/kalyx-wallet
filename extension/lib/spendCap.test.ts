import { describe, expect, test } from 'vitest';
import { makeSpendCap } from './spendCap';
import { makeGrants } from './grants';
import { makeStore, type StorageArea } from './storage';

function area(): StorageArea {
  const data: Record<string, unknown> = {};
  return {
    async get(keys) { return Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, structuredClone(data[k])])); },
    async set(items) { Object.assign(data, structuredClone(items)); },
    async remove(keys) { for (const k of keys) delete data[k]; },
  };
}

describe('plafond journalier', () => {
  test('sans plafond : jamais de mot de passe, même pour une valeur inconnue', async () => {
    const c = makeSpendCap({ disk: makeStore(area()) });
    expect(await c.needsPassword(1_000_000)).toBe(false);
    expect(await c.needsPassword(null)).toBe(false);
  });

  test('cumul du jour ; au-delà, ou valeur inconnue : mot de passe ; le lendemain, remise à zéro', async () => {
    let now = new Date(2026, 9, 23, 10).getTime();
    const c = makeSpendCap({ disk: makeStore(area()), now: () => now });
    await c.setLimit(500);
    expect(await c.needsPassword(400)).toBe(false);
    await c.record(400);
    expect(await c.status()).toMatchObject({ limit: 500, spent: 400, remaining: 100 });
    expect(await c.needsPassword(100)).toBe(false);
    expect(await c.needsPassword(101)).toBe(true);
    expect(await c.needsPassword(null)).toBe(true);
    now = new Date(2026, 9, 24, 0, 1).getTime();
    expect(await c.status()).toMatchObject({ spent: 0, remaining: 500 });
  });

  test('relever ou retirer assouplit ; baisser non ; seules les valeurs proposées', async () => {
    const c = makeSpendCap({ disk: makeStore(area()) });
    expect(await c.loosens(100)).toBe(false); // aucun plafond : en poser un ne l'assouplit pas
    await c.setLimit(500);
    expect(await c.loosens(1000)).toBe(true);
    expect(await c.loosens(null)).toBe(true);
    expect(await c.loosens(250)).toBe(false);
    await expect(c.setLimit(123)).rejects.toThrow('BAD_REQUEST');
  });
});

describe('rappels d’autorisations', () => {
  const base = { chainId: 'ethereum', chainName: 'Ethereum', token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', spender: '0x000000000022D473030F116dDEE9F6B43aC78BA3', origin: 'https://app.uniswap.org' };

  test('un seul rappel par autorisation ; échu → signalé UNE fois ; retiré après révocation', async () => {
    let now = 1_000_000;
    const g = makeGrants({ disk: makeStore(area()), now: () => now });
    await g.add({ ...base, at: now, expiresAt: now + 3_600_000 });
    await g.add({ ...base, token: base.token.toLowerCase(), at: now, expiresAt: now + 7_200_000 });
    expect(await g.list()).toHaveLength(1);
    expect(await g.takeDue()).toEqual([]);
    now += 7_200_001;
    expect((await g.takeDue()).map((x) => x.symbol)).toEqual(['USDC']);
    expect(await g.takeDue()).toEqual([]);
    expect(await g.expired()).toHaveLength(1);
    await g.remove('ethereum', base.token, base.spender.toLowerCase());
    expect(await g.list()).toEqual([]);
  });
});
