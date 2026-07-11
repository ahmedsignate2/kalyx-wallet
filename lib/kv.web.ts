/**
 * Stockage clé-valeur — implémentation WEB (IndexedDB).
 *
 * expo-secure-store n'existe pas sur navigateur. On persiste dans **IndexedDB**
 * (store `kv` de la base `nova`), pas dans localStorage : plus de quota, asynchrone
 * natif, et pas exposé aux scripts synchrones tiers de la même façon.
 *
 * ⚠️ IndexedDB n'est PAS chiffré au repos par l'OS (contrairement au Keychain/
 * Keystore mobile). Mais le coffre du wallet est déjà chiffré **AES-256-GCM** sous
 * une clé dérivée du PIN par **scrypt** (voir src/security/vault) AVANT d'être écrit
 * ici — le secret n'est donc jamais stocké en clair. La copie biométrique n'est pas
 * utilisée sur web (voir biometrics.web.ts).
 *
 * Repli localStorage si IndexedDB est indisponible (ex. certains modes privés).
 */
type Opts = unknown;

const DB_NAME = 'nova';
const STORE = 'kv';
const VERSION = 1;

interface IDBReq<T> {
  result: T;
  error: unknown;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
}
interface IDBOpenReq extends IDBReq<IDBDatabaseLike> {
  onupgradeneeded: (() => void) | null;
}
interface IDBStoreLike {
  get(key: string): IDBReq<unknown>;
  put(value: unknown, key: string): IDBReq<unknown>;
  delete(key: string): IDBReq<unknown>;
}
interface IDBTxLike {
  objectStore(name: string): IDBStoreLike;
}
interface IDBDatabaseLike {
  transaction(store: string, mode: 'readonly' | 'readwrite'): IDBTxLike;
  createObjectStore(name: string): void;
  objectStoreNames: { contains(name: string): boolean };
}
interface IDBFactoryLike {
  open(name: string, version: number): IDBOpenReq;
}

const idb = (): IDBFactoryLike | undefined =>
  (globalThis as { indexedDB?: IDBFactoryLike }).indexedDB;

interface WebStorage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}
const ls = (): WebStorage | undefined => (globalThis as { localStorage?: WebStorage }).localStorage;

let dbPromise: Promise<IDBDatabaseLike | null> | null = null;

function openDB(): Promise<IDBDatabaseLike | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    const factory = idb();
    if (!factory) return resolve(null);
    try {
      const req = factory.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function wrap<T>(req: IDBReq<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function kvSet(key: string, value: string, _opts?: Opts): Promise<void> {
  const db = await openDB();
  if (!db) {
    try { ls()?.setItem(key, value); } catch { /* ignore */ }
    return;
  }
  try {
    await wrap(db.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key));
  } catch {
    try { ls()?.setItem(key, value); } catch { /* ignore */ }
  }
}

export async function kvGet(key: string, _opts?: Opts): Promise<string | null> {
  const db = await openDB();
  if (!db) {
    try { return ls()?.getItem(key) ?? null; } catch { return null; }
  }
  try {
    const v = await wrap(db.transaction(STORE, 'readonly').objectStore(STORE).get(key));
    return typeof v === 'string' ? v : null;
  } catch {
    try { return ls()?.getItem(key) ?? null; } catch { return null; }
  }
}

export async function kvDel(key: string, _opts?: Opts): Promise<void> {
  const db = await openDB();
  if (!db) {
    try { ls()?.removeItem(key); } catch { /* ignore */ }
    return;
  }
  try {
    await wrap(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(key));
  } catch {
    try { ls()?.removeItem(key); } catch { /* ignore */ }
  }
}
