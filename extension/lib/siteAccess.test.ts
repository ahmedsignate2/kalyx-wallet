import { describe, expect, test } from 'vitest';
import { ALL_SITES, makeSiteAccess, matchFor } from './siteAccess';
import { makeStore, type StorageArea } from './storage';

function area(): StorageArea {
  const data: Record<string, unknown> = {};
  return {
    async get(keys) { return Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, structuredClone(data[k])])); },
    async set(items) { Object.assign(data, structuredClone(items)); },
    async remove(keys) { for (const k of keys) delete data[k]; },
  };
}

const make = (connected: string[] = []) => {
  const registered: string[][] = [];
  const access = makeSiteAccess({ disk: makeStore(area()), connected: async () => connected, register: async (m) => void registered.push(m) });
  return { access, registered };
};

describe('présence de Kalyx sur les sites', () => {
  test('motif Chrome : sans port ni chemin ; refus de tout ce qui n’est pas une page web', () => {
    expect(matchFor('https://app.uniswap.org')).toBe('https://app.uniswap.org/*');
    expect(matchFor('http://localhost:5173')).toBe('http://localhost/*');
    for (const bad of ['chrome://settings', 'javascript:alert(1)', 'file:///etc/passwd', 'not a url', 'chrome-extension://abc']) expect(matchFor(bad)).toBeNull();
  });

  test('par défaut : partout', async () => {
    const { access } = make();
    expect(await access.mode()).toBe('all');
    expect(await access.matches()).toEqual(ALL_SITES);
    expect(await access.active('https://example.com')).toBe(true);
  });

  test('sites autorisés seulement : rien tant que rien n’est autorisé ; les sites connectés le restent', async () => {
    const { access, registered } = make(['https://app.aave.com']);
    await access.setMode('allowed');
    expect(registered.at(-1)).toEqual(['https://app.aave.com/*']);
    expect(await access.active('https://evil.example')).toBe(false);
    expect(await access.active('https://app.aave.com')).toBe(true);
    expect(await access.allow('https://app.uniswap.org/swap?x=1')).toBe('https://app.uniswap.org');
    expect(registered.at(-1)).toEqual(['https://app.aave.com/*', 'https://app.uniswap.org/*']);
    await access.forbid('https://app.uniswap.org');
    expect(await access.active('https://app.uniswap.org')).toBe(false);
    await access.setMode('all');
    expect(registered.at(-1)).toEqual(ALL_SITES);
  });

  test('refus : origine invalide, mode inconnu', async () => {
    const { access } = make();
    await expect(access.allow('chrome://extensions')).rejects.toThrow('BAD_ORIGIN');
    await expect(access.allow(42)).rejects.toThrow('BAD_ORIGIN');
    await expect(access.setMode('everywhere')).rejects.toThrow('BAD_REQUEST');
  });
});
