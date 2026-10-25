/**
 * COFFRE de l'extension — clés à deux étages.
 *
 *   mot de passe ──scrypt──► clé d'enveloppe ──AES-GCM──► CLÉ DU COFFRE (256 bits, aléatoire)
 *                                                            │
 *                                    AES-GCM, lié à l'id ────┴──► chaque secret (phrase, clé privée)
 *
 * Pourquoi deux étages :
 *  - le scrypt, coûteux, ne tourne qu'au déverrouillage, pas à chaque secret ;
 *  - changer de mot de passe ne réemballe que la clé du coffre, sans toucher
 *    aux secrets ;
 *  - second facteur (passkey) : un étage de plus, imbriqué (voir plus bas).
 *
 * Passkey (WebAuthn PRF), optionnelle :
 *
 *   mot de passe ──scrypt──► enveloppe EXTÉRIEURE ─┐
 *   passkey ──PRF──HKDF───► enveloppe INTÉRIEURE ──┴──► CLÉ DU COFFRE
 *
 * Il faut les DEUX : le mot de passe seul ne donne qu'un chiffré, la passkey
 * seule n'ouvre rien. La sortie PRF est un secret de l'authentificateur
 * (Touch ID, Windows Hello, téléphone, clé de sécurité), jamais stockée.
 * Changer le mot de passe ne réemballe que l'extérieur : la passkey n'est pas
 * redemandée.
 *
 * PLUSIEURS passkeys (format actuel, `passkeys`) : l'extérieur emballe une
 * clé W, tirée au hasard ; chaque passkey a sa case, scellée par une clé tirée
 * de W ET de SA sortie PRF :
 *
 *   mot de passe ──scrypt──► W ─┐
 *   passkey i ──PRF─────────────┴─HKDF──► case i ──AES-GCM──► CLÉ DU COFFRE
 *
 * N'importe laquelle des passkeys, avec le mot de passe, ouvre le coffre : en
 * perdre une (ordinateur changé, téléphone perdu) ne bloque plus tout. Une
 * empreinte (`gate`) par case permet aussi de CONFIRMER une signature avec la
 * passkey seule, session déjà ouverte ; elle ne révèle rien de la sortie PRF.
 * L'ancien format (une passkey, `passkey`) s'ouvre toujours et se convertit
 * au premier déverrouillage.
 *
 * Les briques sont celles du mobile, déjà auditées : dérivation scrypt avec
 * paramètres bornés (src/security/vault), scellement AES-GCM dont les données
 * associées lient chaque secret à SON coffre et à SON identifiant
 * (src/domain/backup/cloudBackup) — un secret recopié sous un autre nom ne
 * s'ouvre pas.
 *
 * Erreurs : `Error` dont le message est un code — WRONG_PASSWORD,
 * PASSKEY_REQUIRED, WRONG_PASSKEY, PASSKEY_EXISTS, NO_PASSKEY,
 * TOO_MANY_PASSKEYS, BAD_PASSKEY, CORRUPTED, UNKNOWN_WALLET.
 */
import { gcm } from '@noble/ciphers/aes';
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';
import { getRandomBytes } from '../../src/crypto/random';
import { assertKdfParams, deriveKey } from '../../src/security/vault';
import { openSecret, sealSecret, type SealedSecret } from '../../src/domain/backup/cloudBackup';

/** scrypt d'un mot de passe sur ordinateur : 2^17 (128 Mo, ~1 s), le maximum accepté par les bornes du cœur. */
export const EXT_KDF = { N: 1 << 17, r: 8, p: 1 };

export type SecretKind = 'seed' | 'privateKey';

export interface VaultEntry {
  kind: SecretKind;
  secret: SealedSecret;
}

export interface ExtVault {
  v: 1;
  /** Identifiant aléatoire du coffre : entre dans les données associées de chaque secret. */
  id: string;
  kdf: { name: 'scrypt'; N: number; r: number; p: number; salt: string };
  /** Clé du coffre (ou, avec passkey, l'enveloppe intérieure), emballée par la clé dérivée du mot de passe. */
  key: { n: string; ct: string };
  /** Ancien format (une passkey) : identifiant (base64url), sel PRF, nonce de l'enveloppe intérieure. */
  passkey?: { cred: string; salt: string; n: string };
  /** Format actuel : une case par passkey (l'extérieur emballe alors W, pas la clé du coffre). */
  passkeys?: PasskeySlot[];
  wallets: Record<string, VaultEntry>;
}

/** Où vit la passkey : cet ordinateur, un téléphone (à proximité, par QR), une clé de sécurité. */
export type PasskeyKind = 'device' | 'phone' | 'key';
export const PASSKEY_KINDS: readonly PasskeyKind[] = ['device', 'phone', 'key'];
export const MAX_PASSKEYS = 5;

export interface PasskeySlot {
  cred: string;
  salt: string;
  /** Clé du coffre scellée par HKDF(W ‖ PRF). */
  n: string;
  ct: string;
  kind: PasskeyKind;
  /** Ajoutée le (ms) ; 0 pour une passkey reprise de l'ancien format. */
  at: number;
  /** Empreinte de la sortie PRF (confirmation par la passkey seule, session ouverte). */
  gate: string;
}

const KEY_LEN = 32;
const hex = (s: unknown, len?: number) => typeof s === 'string' && /^[0-9a-f]*$/.test(s) && s.length % 2 === 0 && (len === undefined || s.length === len);
const keyAad = (id: string) => utf8ToBytes(`kalyx-ext-vault|${id}|v1`);
const innerAad = (id: string, cred: string) => utf8ToBytes(`kalyx-ext-passkey|${id}|${cred}|v1`);
const CRED = /^[A-Za-z0-9_-]{16,1400}$/;
/** Sortie PRF (32 octets) + sel du coffre → clé de l'enveloppe intérieure. */
const prfKey = (prf: Uint8Array, salt: string) => hkdf(sha256, prf, hexToBytes(salt), utf8ToBytes('kalyx-ext-passkey-v1'), KEY_LEN);
const isPrf = (prf: unknown): prf is Uint8Array => prf instanceof Uint8Array && prf.length === KEY_LEN;
const slotAad = (id: string, cred: string) => utf8ToBytes(`kalyx-ext-passkey-slot|${id}|${cred}|v2`);
/** W (mot de passe) et sortie PRF (passkey) → clé de la case : il faut les deux. */
const slotKey = (w: Uint8Array, prf: Uint8Array, salt: string) => hkdf(sha256, concatBytes(w, prf), hexToBytes(salt), utf8ToBytes('kalyx-ext-passkey-slot-v2'), KEY_LEN);
/** Empreinte publique de la sortie PRF (un secret de 256 bits : rien à deviner). */
const gateOf = (prf: Uint8Array, salt: string) => bytesToHex(sha256(hkdf(sha256, prf, hexToBytes(salt), utf8ToBytes('kalyx-ext-passkey-gate-v2'), KEY_LEN)));
const WALLET_ID = /^[a-z0-9-]{1,64}$/;

function wrap(kek: Uint8Array, id: string, vaultKey: Uint8Array): ExtVault['key'] {
  const n = getRandomBytes(12);
  return { n: bytesToHex(n), ct: bytesToHex(gcm(kek, n, keyAad(id)).encrypt(vaultKey)) };
}

async function kekFor(password: string, kdf: ExtVault['kdf']): Promise<Uint8Array> {
  return deriveKey(password, hexToBytes(kdf.salt), kdf);
}

/** Crée un coffre vide. Rend aussi la clé du coffre, pour ouvrir la session sans refaire le scrypt. */
export async function createVault(password: string, params = EXT_KDF): Promise<{ vault: ExtVault; vaultKey: Uint8Array }> {
  const id = bytesToHex(getRandomBytes(16));
  const kdf = { name: 'scrypt' as const, ...params, salt: bytesToHex(getRandomBytes(16)) };
  const vaultKey = getRandomBytes(KEY_LEN);
  const kek = await kekFor(password, kdf);
  try {
    return { vault: { v: 1, id, kdf, key: wrap(kek, id, vaultKey), wallets: {} }, vaultKey };
  } finally {
    kek.fill(0);
  }
}

/**
 * Vérifie la FORME d'un coffre lu sur le disque, avant tout calcul : un coffre
 * altéré ne doit ni planter ni imposer un scrypt démesuré (paramètres bornés).
 */
export function parseVault(raw: unknown): ExtVault {
  const v = raw as ExtVault;
  if (!v || typeof v !== 'object' || v.v !== 1 || !hex(v.id, 32)) throw new Error('CORRUPTED');
  if (!v.kdf || v.kdf.name !== 'scrypt' || !hex(v.kdf.salt, 32)) throw new Error('CORRUPTED');
  try {
    assertKdfParams(v.kdf);
  } catch {
    throw new Error('CORRUPTED');
  }
  if (v.passkey !== undefined && (!v.passkey || !CRED.test(v.passkey.cred) || !hex(v.passkey.salt, 64) || !hex(v.passkey.n, 24))) throw new Error('CORRUPTED');
  if (v.passkeys !== undefined) {
    if (v.passkey !== undefined || !Array.isArray(v.passkeys) || v.passkeys.length < 1 || v.passkeys.length > MAX_PASSKEYS) throw new Error('CORRUPTED');
    const seen = new Set<string>();
    for (const s of v.passkeys) {
      const ok = !!s && CRED.test(s.cred) && !seen.has(s.cred) && hex(s.salt, 64) && hex(s.n, 24) && hex(s.ct, (KEY_LEN + 16) * 2) && PASSKEY_KINDS.includes(s.kind) && Number.isSafeInteger(s.at) && s.at >= 0 && hex(s.gate, 64);
      if (!ok) throw new Error('CORRUPTED');
      seen.add(s.cred);
    }
  }
  // Ancien format : l'extérieur emballe l'enveloppe intérieure (clé + étiquette GCM) ; sinon une clé (du coffre, ou W).
  const inner = v.passkey ? KEY_LEN + 16 : KEY_LEN;
  if (!v.key || !hex(v.key.n, 24) || !hex(v.key.ct, (inner + 16) * 2)) throw new Error('CORRUPTED');
  if (!v.wallets || typeof v.wallets !== 'object') throw new Error('CORRUPTED');
  for (const [id, w] of Object.entries(v.wallets)) {
    if (!WALLET_ID.test(id) || (w?.kind !== 'seed' && w?.kind !== 'privateKey') || !hex(w.secret?.n, 24) || !hex(w.secret?.ct)) throw new Error('CORRUPTED');
  }
  return v;
}

/** Mot de passe → contenu de l'enveloppe extérieure (et la clé d'enveloppe, à effacer). */
async function openOuter(vault: ExtVault, password: string): Promise<{ plain: Uint8Array; kek: Uint8Array }> {
  const kek = await kekFor(password, vault.kdf);
  try {
    return { plain: gcm(kek, hexToBytes(vault.key.n), keyAad(vault.id)).decrypt(hexToBytes(vault.key.ct)), kek };
  } catch {
    kek.fill(0);
    throw new Error('WRONG_PASSWORD');
  }
}

/**
 * Mot de passe (+ sortie PRF de la passkey si le coffre en a une) → clé du
 * coffre. `WRONG_PASSWORD`, `PASSKEY_REQUIRED` ou `WRONG_PASSKEY`.
 */
export async function unlockVault(vault: ExtVault, password: string, prf?: Uint8Array): Promise<Uint8Array> {
  const { plain, kek } = await openOuter(vault, password);
  kek.fill(0);
  if (vault.passkeys) {
    try {
      if (!isPrf(prf)) throw new Error('PASSKEY_REQUIRED');
      return openSlots(vault, plain, prf);
    } finally {
      plain.fill(0);
    }
  }
  if (!vault.passkey) return plain;
  try {
    if (!isPrf(prf)) throw new Error('PASSKEY_REQUIRED');
    const k = prfKey(prf, vault.passkey.salt);
    try {
      return gcm(k, hexToBytes(vault.passkey.n), innerAad(vault.id, vault.passkey.cred)).decrypt(plain);
    } catch {
      throw new Error('WRONG_PASSKEY');
    } finally {
      k.fill(0);
    }
  } finally {
    plain.fill(0);
  }
}

/** Vérifie le mot de passe seul (action sensible, session déjà ouverte avec les deux facteurs). */
export async function checkVaultPassword(vault: ExtVault, password: string): Promise<void> {
  const { plain, kek } = await openOuter(vault, password);
  plain.fill(0);
  kek.fill(0);
}

/** Nouveau mot de passe : seule l'enveloppe extérieure change (nouveau sel) ; passkey et secrets restent tels quels. */
export async function changeVaultPassword(vault: ExtVault, oldPassword: string, newPassword: string, params = EXT_KDF): Promise<ExtVault> {
  const { plain, kek: old } = await openOuter(vault, oldPassword);
  old.fill(0);
  const kdf = { name: 'scrypt' as const, ...params, salt: bytesToHex(getRandomBytes(16)) };
  const kek = await kekFor(newPassword, kdf);
  try {
    return { ...vault, kdf, key: wrap(kek, vault.id, plain) };
  } finally {
    kek.fill(0);
    plain.fill(0);
  }
}

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.reduce((d, x, i) => d | (x ^ b[i]), 0) === 0;

/** W + sortie PRF → clé du coffre, par la case de CETTE passkey (les autres ne s'ouvrent pas). `WRONG_PASSKEY` sinon. */
function openSlots(vault: ExtVault, w: Uint8Array, prf: Uint8Array): Uint8Array {
  for (const s of vault.passkeys ?? []) {
    const k = slotKey(w, prf, s.salt);
    try {
      return gcm(k, hexToBytes(s.n), slotAad(vault.id, s.cred)).decrypt(hexToBytes(s.ct));
    } catch {
      /* pas cette case */
    } finally {
      k.fill(0);
    }
  }
  throw new Error('WRONG_PASSKEY');
}

function makeSlot(id: string, w: Uint8Array, vaultKey: Uint8Array, p: { cred: string; salt: string; prf: Uint8Array; kind: PasskeyKind }, at: number): PasskeySlot {
  const k = slotKey(w, p.prf, p.salt);
  try {
    const n = getRandomBytes(12);
    return { cred: p.cred, salt: p.salt, n: bytesToHex(n), ct: bytesToHex(gcm(k, n, slotAad(id, p.cred)).encrypt(vaultKey)), kind: p.kind, at, gate: gateOf(p.prf, p.salt) };
  } finally {
    k.fill(0);
  }
}

/** Ancien format : mot de passe (contenu extérieur) + PRF → clé du coffre. */
function openLegacy(vault: ExtVault, inner: Uint8Array, prf: Uint8Array): Uint8Array {
  const k = prfKey(prf, vault.passkey!.salt);
  try {
    return gcm(k, hexToBytes(vault.passkey!.n), innerAad(vault.id, vault.passkey!.cred)).decrypt(inner);
  } catch {
    throw new Error('WRONG_PASSKEY');
  } finally {
    k.fill(0);
  }
}

/** Nouveau W, l'extérieur réemballé, une case par passkey donnée. */
function rebuild(vault: ExtVault, kek: Uint8Array, vaultKey: Uint8Array, slots: { cred: string; salt: string; prf: Uint8Array; kind: PasskeyKind; at: number }[]): ExtVault {
  const w = getRandomBytes(KEY_LEN);
  try {
    const { passkey: _old, ...rest } = vault;
    return { ...rest, key: wrap(kek, vault.id, w), passkeys: slots.map((s) => makeSlot(vault.id, w, vaultKey, s, s.at)) };
  } finally {
    w.fill(0);
  }
}

/**
 * Ajoute une passkey (jusqu'à cinq). Il faut le mot de passe, la clé de la
 * session ouverte (elle doit être celle du coffre) et, s'il y a déjà une
 * passkey, la sortie PRF de l'une d'elles (`proof`) : un second facteur ne
 * s'ajoute pas sans le premier.
 */
export async function addPasskey(
  vault: ExtVault,
  password: string,
  sessionKey: Uint8Array,
  proof: Uint8Array | undefined,
  p: { cred: string; salt: string; prf: Uint8Array; kind: PasskeyKind },
  at: number,
): Promise<ExtVault> {
  if (!CRED.test(p.cred) || !hex(p.salt, 64) || !isPrf(p.prf) || !PASSKEY_KINDS.includes(p.kind)) throw new Error('BAD_PASSKEY');
  const known = vault.passkeys?.map((s) => s.cred) ?? (vault.passkey ? [vault.passkey.cred] : []);
  if (known.includes(p.cred)) throw new Error('PASSKEY_EXISTS');
  if (known.length >= MAX_PASSKEYS) throw new Error('TOO_MANY_PASSKEYS');
  if (known.length && !isPrf(proof)) throw new Error('PASSKEY_REQUIRED');
  const { plain, kek } = await openOuter(vault, password);
  let vaultKey: Uint8Array | null = null;
  try {
    if (vault.passkeys) {
      vaultKey = openSlots(vault, plain, proof!);
      if (!sameBytes(vaultKey, sessionKey)) throw new Error('CORRUPTED');
      return { ...vault, passkeys: [...vault.passkeys, makeSlot(vault.id, plain, vaultKey, p, at)] };
    }
    if (vault.passkey) {
      vaultKey = openLegacy(vault, plain, proof!);
      if (!sameBytes(vaultKey, sessionKey)) throw new Error('CORRUPTED');
      return rebuild(vault, kek, vaultKey, [{ cred: vault.passkey.cred, salt: vault.passkey.salt, prf: proof!, kind: 'device', at: 0 }, { ...p, at }]);
    }
    if (!sameBytes(plain, sessionKey)) throw new Error('CORRUPTED');
    return rebuild(vault, kek, plain, [{ ...p, at }]);
  } finally {
    plain.fill(0);
    kek.fill(0);
    vaultKey?.fill(0);
  }
}

/**
 * Retire la passkey `cred` : mot de passe et une passkey (n'importe laquelle,
 * `proof`) une dernière fois. La dernière retirée, le mot de passe suffit de
 * nouveau.
 */
export async function removePasskey(vault: ExtVault, password: string, proof: Uint8Array, cred: string): Promise<ExtVault> {
  if (!vault.passkeys && !vault.passkey) throw new Error('NO_PASSKEY');
  if (!isPrf(proof)) throw new Error('PASSKEY_REQUIRED');
  const known = vault.passkeys?.map((s) => s.cred) ?? [vault.passkey!.cred];
  if (!known.includes(cred)) throw new Error('NO_PASSKEY');
  const { plain, kek } = await openOuter(vault, password);
  let vaultKey: Uint8Array | null = null;
  try {
    vaultKey = vault.passkeys ? openSlots(vault, plain, proof) : openLegacy(vault, plain, proof);
    const left = (vault.passkeys ?? []).filter((s) => s.cred !== cred);
    if (left.length) return { ...vault, passkeys: left };
    const { passkey: _a, passkeys: _b, ...rest } = vault;
    return { ...rest, key: wrap(kek, vault.id, vaultKey) };
  } finally {
    plain.fill(0);
    kek.fill(0);
    vaultKey?.fill(0);
  }
}

/** Ancien format (une passkey) → format actuel, au déverrouillage (mot de passe et PRF justes en main). */
export async function upgradeLegacyPasskey(vault: ExtVault, password: string, prf: Uint8Array): Promise<ExtVault> {
  if (!vault.passkey) return vault;
  const { plain, kek } = await openOuter(vault, password);
  let vaultKey: Uint8Array | null = null;
  try {
    vaultKey = openLegacy(vault, plain, prf);
    return rebuild(vault, kek, vaultKey, [{ cred: vault.passkey.cred, salt: vault.passkey.salt, prf, kind: 'device', at: 0 }]);
  } finally {
    plain.fill(0);
    kek.fill(0);
    vaultKey?.fill(0);
  }
}

/** La sortie PRF est-elle celle d'une passkey du coffre ? (confirmation d'une signature, session ouverte) */
export function passkeyMatches(vault: ExtVault, prf: Uint8Array): boolean {
  if (!isPrf(prf)) return false;
  return (vault.passkeys ?? []).some((s) => sameBytes(hexToBytes(gateOf(prf, s.salt)), hexToBytes(s.gate)));
}

/** Passkeys du coffre, pour les réglages et pour les demander (rien de secret). */
export function passkeysOf(vault: ExtVault | null | undefined): { cred: string; salt: string; kind: PasskeyKind; at: number }[] {
  if (!vault) return [];
  if (vault.passkeys) return vault.passkeys.map(({ cred, salt, kind, at }) => ({ cred, salt, kind, at }));
  return vault.passkey ? [{ cred: vault.passkey.cred, salt: vault.passkey.salt, kind: 'device', at: 0 }] : [];
}

export function addSecret(vault: ExtVault, vaultKey: Uint8Array, walletId: string, kind: SecretKind, secret: string): ExtVault {
  if (!WALLET_ID.test(walletId)) throw new Error('CORRUPTED');
  return { ...vault, wallets: { ...vault.wallets, [walletId]: { kind, secret: sealSecret(vaultKey, vault.id, walletId, secret) } } };
}

export function readSecret(vault: ExtVault, vaultKey: Uint8Array, walletId: string): { kind: SecretKind; secret: string } {
  const w = vault.wallets[walletId];
  if (!w) throw new Error('UNKNOWN_WALLET');
  return { kind: w.kind, secret: openSecret(vaultKey, vault.id, walletId, w.secret) };
}

export function removeSecret(vault: ExtVault, walletId: string): ExtVault {
  const { [walletId]: _gone, ...wallets } = vault.wallets;
  return { ...vault, wallets };
}

/* ── Coffre leurre (code de contrainte) ── */

const decoyAad = (id: string) => utf8ToBytes(`kalyx-ext-decoy|${id}|v1`);

/** Coffre leurre : un coffre ordinaire (protégé par le code) dont la clé est AUSSI scellée par la clé du vrai coffre. */
export type DecoyVault = ExtVault & { byMain: { n: string; ct: string } };

export function parseDecoyVault(raw: unknown): DecoyVault {
  const v = parseVault(raw) as DecoyVault;
  if (v.passkey || v.passkeys || !v.byMain || !hex(v.byMain.n, 24) || !hex(v.byMain.ct, (KEY_LEN + 16) * 2)) throw new Error('CORRUPTED');
  return v;
}

/** Nouveau coffre leurre, vide, protégé par le code ; sa clé scellée par la clé du vrai coffre. */
export async function createDecoyVault(code: string, mainKey: Uint8Array, params = EXT_KDF): Promise<DecoyVault> {
  const { vault, vaultKey } = await createVault(code, params);
  try {
    const n = getRandomBytes(12);
    return { ...vault, byMain: { n: bytesToHex(n), ct: bytesToHex(gcm(mainKey, n, decoyAad(vault.id)).encrypt(vaultKey)) } };
  } finally {
    vaultKey.fill(0);
  }
}

/** Nouveau code pour le coffre leurre existant, depuis le vrai profil (sans l'ancien code) : ses portefeuilles restent. */
export async function recodeDecoyVault(decoy: DecoyVault, code: string, mainKey: Uint8Array, params = EXT_KDF): Promise<DecoyVault> {
  let dk: Uint8Array;
  try {
    dk = gcm(mainKey, hexToBytes(decoy.byMain.n), decoyAad(decoy.id)).decrypt(hexToBytes(decoy.byMain.ct));
  } catch {
    throw new Error('CORRUPTED');
  }
  const kdf = { name: 'scrypt' as const, ...params, salt: bytesToHex(getRandomBytes(16)) };
  const kek = await kekFor(code, kdf);
  try {
    return { ...decoy, kdf, key: wrap(kek, decoy.id, dk) };
  } finally {
    kek.fill(0);
    dk.fill(0);
  }
}
