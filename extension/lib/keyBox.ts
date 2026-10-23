/**
 * BOÎTE À CLÉ de la session : la clé du coffre n'existe en clair que le
 * temps d'une opération (signer, lire un secret), jamais au repos.
 *
 *   clé du coffre ──AES-GCM──► bloc scellé (zone session de Chrome)
 *                     ▲
 *        clé d'emballage W : CryptoKey NON EXPORTABLE (WebCrypto)
 *
 * W est tirée au déverrouillage. Ses octets n'existent jamais en JS : aucun
 * code, même le nôtre, ne peut les lire ; seul le moteur de Chrome s'en sert.
 * Au repos, la zone session ne contient donc qu'un chiffré inutilisable seul,
 * et plus une clé en hexadécimal (une chaîne JS ne s'efface pas).
 *
 * Normal : W est aussi gardée dans IndexedDB (une CryptoKey s'y range sans
 * être exportée) pour survivre aux arrêts du service worker (~30 s
 * d'inactivité). Mode parano : W reste en mémoire seulement ; le service
 * worker arrêté, la session est perdue (verrouillée).
 */
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

export interface WrapKeyStore {
  get(): Promise<CryptoKey | null>;
  set(k: CryptoKey): Promise<void>;
  clear(): Promise<void>;
}

export interface SealedKey {
  n: string;
  ct: string;
}

export const isSealedKey = (v: unknown): v is SealedKey =>
  !!v && typeof v === 'object' && /^[0-9a-f]{24}$/.test((v as SealedKey).n) && /^[0-9a-f]{96}$/.test((v as SealedKey).ct);

/** W dans IndexedDB (service worker). Base propre à l'extension, une seule entrée. */
export const KEYBOX_DB = 'kalyx-keybox';

export function idbWrapStore(dbName = KEYBOX_DB): WrapKeyStore {
  const db = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(dbName, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('k');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  const tx = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const d = await db();
    try {
      return await new Promise<T>((resolve, reject) => {
        const req = fn(d.transaction('k', mode).objectStore('k'));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } finally {
      d.close();
    }
  };
  return {
    get: async () => ((await tx('readonly', (s) => s.get('w'))) as CryptoKey | undefined) ?? null,
    set: async (k) => void (await tx('readwrite', (s) => s.put(k, 'w'))),
    clear: async () => void (await tx('readwrite', (s) => s.delete('w'))),
  };
}

/** Pour les tests (et un navigateur sans IndexedDB) : W en mémoire seulement. */
export function memoryWrapStore(): WrapKeyStore {
  let k: CryptoKey | null = null;
  return { get: async () => k, set: async (v) => void (k = v), clear: async () => void (k = null) };
}

export function makeKeyBox(store: WrapKeyStore) {
  let w: CryptoKey | null = null;
  const wrapKey = async () => w ?? (w = await store.get().catch(() => null));

  return {
    /** Scelle la clé du coffre sous une W neuve. L'appelant efface `raw`. */
    async seal(raw: Uint8Array, persist: boolean): Promise<SealedKey> {
      w = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      if (persist) await store.set(w);
      else await store.clear().catch(() => {});
      const n = crypto.getRandomValues(new Uint8Array(12));
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: n }, w, raw as Uint8Array<ArrayBuffer>));
      return { n: bytesToHex(n), ct: bytesToHex(ct) };
    },
    /** Clé du coffre en clair, pour UNE opération : l'appelant l'efface. null si W est perdue. */
    async open(s: SealedKey): Promise<Uint8Array | null> {
      const k = await wrapKey();
      if (!k) return null;
      try {
        return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: hexToBytes(s.n) as Uint8Array<ArrayBuffer> }, k, hexToBytes(s.ct) as Uint8Array<ArrayBuffer>));
      } catch {
        return null;
      }
    },
    /** W encore disponible (mémoire ou IndexedDB) ? */
    async available(): Promise<boolean> {
      return !!(await wrapKey());
    },
    /** Mode parano activé ou coupé en cours de session : W quitte IndexedDB, ou y revient. */
    async persist(on: boolean): Promise<void> {
      if (!on) await store.clear().catch(() => {});
      else if (w) await store.set(w);
    },
    async clear(): Promise<void> {
      w = null;
      await store.clear().catch(() => {});
    },
  };
}

export type KeyBox = ReturnType<typeof makeKeyBox>;
