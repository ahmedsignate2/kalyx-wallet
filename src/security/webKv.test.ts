/**
 * kv.web.ts — chiffrement au repos des valeurs du tableau de bord web.
 * IndexedDB est simulé en mémoire ; WebCrypto est celui de Node.
 */

type Req = { result: unknown; error: unknown; onsuccess: (() => void) | null; onerror: (() => void) | null };

function makeFakeIndexedDB() {
  const stores = new Map<string, Map<string, unknown>>();
  const req = (run: () => unknown): Req => {
    const r: Req = { result: undefined, error: null, onsuccess: null, onerror: null };
    setTimeout(() => {
      try {
        r.result = run();
        r.onsuccess?.();
      } catch (e) {
        r.error = e;
        r.onerror?.();
      }
    }, 0);
    return r;
  };
  const db = {
    objectStoreNames: { contains: (n: string) => stores.has(n) },
    createObjectStore: (n: string) => { stores.set(n, new Map()); },
    transaction: (name: string) => ({
      objectStore: () => {
        const st = stores.get(name)!;
        return {
          get: (k: string) => req(() => st.get(k)),
          put: (v: unknown, k: string) => req(() => { st.set(k, v); return k; }),
          add: (v: unknown, k: string) => req(() => { if (st.has(k)) throw new Error('ConstraintError'); st.set(k, v); return k; }),
          delete: (k: string) => req(() => { st.delete(k); return undefined; }),
        };
      },
    }),
  };
  const factory = {
    open: () => {
      const r = { result: db, error: null, onsuccess: null as (() => void) | null, onerror: null, onupgradeneeded: null as (() => void) | null };
      setTimeout(() => { r.onupgradeneeded?.(); r.onsuccess?.(); }, 0);
      return r;
    },
  };
  return { factory, raw: () => stores.get('kv')! };
}

describe('kv.web — chiffrement au repos', () => {
  const fake = makeFakeIndexedDB();
  beforeAll(() => {
    (globalThis as { indexedDB?: unknown }).indexedDB = fake.factory;
  });

  it('écrit une enveloppe AES-GCM (jamais la valeur en clair) et la relit', async () => {
    const kv = await import('../../lib/kv.web');
    await kv.kvSet('ai_key', 'sk-super-secret');
    const stored = fake.raw().get('ai_key') as { v: number; iv: ArrayBuffer; ct: ArrayBuffer };
    expect(typeof stored).toBe('object');
    expect(stored.v).toBe(1);
    expect(new TextDecoder().decode(stored.ct)).not.toContain('sk-super-secret');
    expect(await kv.kvGet('ai_key')).toBe('sk-super-secret');
  });

  it('la clé de chiffrement est stockée non extractable', async () => {
    const kek = fake.raw().get('__kalyx_kek_v1') as CryptoKey;
    expect(kek.extractable).toBe(false);
    expect(kek.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
  });

  it('migre une ancienne valeur en clair vers l’enveloppe chiffrée', async () => {
    const kv = await import('../../lib/kv.web');
    fake.raw().set('legacy', 'plain-text');
    expect(await kv.kvGet('legacy')).toBe('plain-text');
    /*
     * On ATTEND la condition au lieu de parier sur un délai. L'attente fixe de
     * 20 ms passait en isolation et échouait par intermittence dans la suite
     * complète, sous charge — un test instable rend toute la suite suspecte et
     * fait perdre du temps à chercher une régression qui n'existe pas.
     */
    let after: unknown;
    for (let i = 0; i < 100; i++) {
      after = fake.raw().get('legacy');
      if (typeof after === 'object') break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(typeof after).toBe('object');
    expect(await kv.kvGet('legacy')).toBe('plain-text');
  });

  it('une enveloppe altérée renvoie null, jamais un contenu partiel', async () => {
    const kv = await import('../../lib/kv.web');
    await kv.kvSet('x', 'hello');
    const env = fake.raw().get('x') as { v: number; iv: ArrayBuffer; ct: ArrayBuffer };
    const ct = new Uint8Array(env.ct);
    ct[0] ^= 0xff;
    fake.raw().set('x', { ...env, ct: ct.buffer });
    expect(await kv.kvGet('x')).toBeNull();
  });

  it('kvDel supprime', async () => {
    const kv = await import('../../lib/kv.web');
    await kv.kvSet('y', '1');
    await kv.kvDel('y');
    expect(await kv.kvGet('y')).toBeNull();
  });
});

describe('kv.web — clé de chiffrement partagée entre onglets', () => {
  it('l’onglet qui perd la course prend la clé du gagnant, sans l’écraser', async () => {
    const fake = makeFakeIndexedDB();
    (globalThis as { indexedDB?: unknown }).indexedDB = fake.factory;
    const subtle = globalThis.crypto.subtle;
    const winner = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const realGenerate = subtle.generateKey.bind(subtle);
    const spy = jest.spyOn(subtle, 'generateKey').mockImplementationOnce(async (...args: Parameters<typeof subtle.generateKey>) => {
      fake.raw().set('__kalyx_kek_v1', winner); // l'autre onglet écrit la sienne pendant ce temps
      return realGenerate(...args);
    });
    let kv: typeof import('../../lib/kv.web') | undefined;
    jest.isolateModules(() => {
      kv = require('../../lib/kv.web');
    });
    await kv!.kvSet('k', 'valeur');
    expect(fake.raw().get('__kalyx_kek_v1')).toBe(winner);
    expect(await kv!.kvGet('k')).toBe('valeur');
    spy.mockRestore();
  });

  it('clé indisponible : rien n’est écrit en clair', async () => {
    const fake = makeFakeIndexedDB();
    (globalThis as { indexedDB?: unknown }).indexedDB = fake.factory;
    const spy = jest.spyOn(globalThis.crypto.subtle, 'generateKey').mockRejectedValue(new Error('refusé'));
    let kv: typeof import('../../lib/kv.web') | undefined;
    jest.isolateModules(() => {
      kv = require('../../lib/kv.web');
    });
    await expect(kv!.kvSet('secret', 'sk-123')).rejects.toThrow();
    expect(fake.raw().get('secret')).toBeUndefined();
    spy.mockRestore();
  });
});
