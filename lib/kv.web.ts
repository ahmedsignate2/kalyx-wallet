/**
 * Stockage clé-valeur — implémentation WEB (IndexedDB).
 *
 * expo-secure-store n'existe pas sur navigateur. On persiste dans **IndexedDB**
 * (store `kv` de la base `nova`), pas dans localStorage : plus de quota, asynchrone
 * natif, et pas exposé aux scripts synchrones tiers de la même façon.
 *
 * IndexedDB n'est pas chiffré au repos par l'OS : chaque valeur est donc chiffrée
 * ici (AES-256-GCM, clé WebCrypto non extractable — voir « Chiffrement » plus bas)
 * avant écriture. Sur le tableau de bord web il n'y a de toute façon aucune clé
 * privée : ce qui est protégé, c'est la clé API BYOK de l'agent, les contacts et
 * les préférences.
 *
 * Repli localStorage si IndexedDB est indisponible (ex. certains modes privés).
 */
import { decoyMayRead, decoyMayWrite } from './sessionMode';

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
  /** Échoue (ConstraintError) si la clé existe déjà. */
  add?(value: unknown, key: string): IDBReq<unknown>;
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

/* ---------------------------------------------------------------- Chiffrement */

/**
 * Chiffrement AU REPOS des valeurs (AES-256-GCM, WebCrypto) sous une clé
 * **non extractable** générée dans le navigateur et conservée dans IndexedDB
 * (un CryptoKey non extractable ne peut pas être lu par du JavaScript, même
 * de la même origine : il ne peut qu'être *utilisé*). Ce que ça ferme : la
 * copie du profil navigateur / des fichiers IndexedDB depuis le disque, les
 * sauvegardes, la lecture directe de la base par un autre logiciel — clé BYOK
 * de l'agent IA, contacts, préférences n'y apparaissent plus en clair.
 * Ce que ça ne ferme PAS : un script exécuté sur cette origine pendant la
 * session (il peut appeler decrypt) — c'est le rôle de la CSP et de l'absence
 * totale de script tiers (voir public/_headers, ui/web/platform.ts).
 * Anciennes valeurs en clair : relues telles quelles puis réécrites chiffrées.
 */
const KEK_ID = '__kalyx_kek_v1';
interface Envelope { v: 1; iv: ArrayBuffer; ct: ArrayBuffer }
type CryptoLike = {
  subtle: {
    generateKey: (alg: { name: string; length: number }, extractable: boolean, usages: string[]) => Promise<unknown>;
    encrypt: (alg: { name: string; iv: Uint8Array }, key: unknown, data: Uint8Array) => Promise<ArrayBuffer>;
    decrypt: (alg: { name: string; iv: Uint8Array }, key: unknown, data: ArrayBuffer) => Promise<ArrayBuffer>;
  };
  getRandomValues: (a: Uint8Array) => Uint8Array;
};
const webCrypto = (): CryptoLike | undefined => {
  const c = (globalThis as { crypto?: CryptoLike }).crypto;
  return c && c.subtle ? c : undefined;
};

let kekPromise: Promise<unknown | null> | null = null;
/**
 * Clé de chiffrement, créée une seule fois — y compris entre deux ONGLETS.
 * Écrite par `add` (refusé si elle existe) puis RELUE : l'onglet qui perd la
 * course prend celle du gagnant au lieu d'écraser la clé qui a chiffré ses
 * valeurs (elles deviendraient illisibles). Un échec n'est pas mis en cache :
 * le prochain appel réessaie.
 */
function getKek(db: IDBDatabaseLike): Promise<unknown | null> {
  if (kekPromise) return kekPromise;
  const attempt = (async () => {
    const c = webCrypto();
    if (!c) return null;
    const read = () => wrap(db.transaction(STORE, 'readonly').objectStore(STORE).get(KEK_ID));
    try {
      const existing = await read();
      if (existing && typeof existing === 'object') return existing;
      const key = await c.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
      try {
        await wrap(store.add ? store.add(key, KEK_ID) : store.put(key, KEK_ID));
      } catch {
        /* un autre onglet l'a écrite entre-temps : on relit la sienne */
      }
      const stored = await read();
      return stored && typeof stored === 'object' ? stored : null;
    } catch {
      return null;
    }
  })();
  kekPromise = attempt;
  void attempt.then((k) => {
    if (!k && kekPromise === attempt) kekPromise = null;
  });
  return attempt;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

async function seal(db: IDBDatabaseLike, value: string): Promise<Envelope | string> {
  const c = webCrypto();
  if (!c) return value; // pas de WebCrypto du tout : clair (navigateur très ancien)
  const kek = await getKek(db);
  // WebCrypto présent mais clé indisponible : on n'écrit RIEN plutôt qu'en clair.
  if (!kek) throw new Error('Stockage chiffré indisponible');
  const iv = c.getRandomValues(new Uint8Array(12));
  const ct = await c.subtle.encrypt({ name: 'AES-GCM', iv }, kek, enc.encode(value));
  return { v: 1, iv: iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer, ct };
}

async function open_(db: IDBDatabaseLike, stored: unknown): Promise<string | null> {
  if (typeof stored === 'string') return stored; // ancienne valeur en clair
  if (!stored || typeof stored !== 'object' || (stored as Envelope).v !== 1) return null;
  const c = webCrypto();
  const kek = await getKek(db);
  if (!c || !kek) return null;
  try {
    const e = stored as Envelope;
    const pt = await c.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(e.iv) }, kek, e.ct);
    return dec.decode(pt);
  } catch {
    return null; // altéré ou clé perdue : jamais de valeur partielle
  }
}

/* ------------------------------------------------------------------- API kv */

export async function kvSet(key: string, value: string, _opts?: Opts): Promise<void> {
  if (!decoyMayWrite(key)) return;
  const db = await openDB();
  if (!db) {
    try { ls()?.setItem(key, value); } catch { /* ignore */ }
    return;
  }
  /*
   * Pas de repli localStorage ici : il écrivait la valeur EN CLAIR dès que le
   * chiffrement ou l'écriture échouait. L'erreur remonte, comme sur mobile.
   */
  const payload = await seal(db, value);
  await wrap(db.transaction(STORE, 'readwrite').objectStore(STORE).put(payload, key));
}

export async function kvGet(key: string, _opts?: Opts): Promise<string | null> {
  if (!decoyMayRead(key)) return null;
  const db = await openDB();
  if (!db) {
    try { return ls()?.getItem(key) ?? null; } catch { return null; }
  }
  try {
    const stored = await wrap(db.transaction(STORE, 'readonly').objectStore(STORE).get(key));
    const v = await open_(db, stored);
    // Migration transparente : une valeur héritée en clair est réécrite chiffrée.
    if (typeof stored === 'string' && v != null) void kvSet(key, v).catch(() => {});
    return v;
  } catch {
    try { return ls()?.getItem(key) ?? null; } catch { return null; }
  }
}

export async function kvDel(key: string, _opts?: Opts): Promise<void> {
  if (!decoyMayWrite(key)) return;
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

/** Sans objet sur le web (localStorage) : options ignorées. */
export const KV_DEVICE_ONLY = {};
