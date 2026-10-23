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
 * (Touch ID, Windows Hello, clé de sécurité), jamais stockée. Changer le mot
 * de passe ne réemballe que l'extérieur : la passkey n'est pas redemandée.
 *
 * Les briques sont celles du mobile, déjà auditées : dérivation scrypt avec
 * paramètres bornés (src/security/vault), scellement AES-GCM dont les données
 * associées lient chaque secret à SON coffre et à SON identifiant
 * (src/domain/backup/cloudBackup) — un secret recopié sous un autre nom ne
 * s'ouvre pas.
 *
 * Erreurs : `Error` dont le message est un code — WRONG_PASSWORD,
 * PASSKEY_REQUIRED, WRONG_PASSKEY, PASSKEY_EXISTS, NO_PASSKEY, CORRUPTED,
 * UNKNOWN_WALLET.
 */
import { gcm } from '@noble/ciphers/aes';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';
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
  /** Second facteur : identifiant de la passkey (base64url), sel PRF, nonce de l'enveloppe intérieure. */
  passkey?: { cred: string; salt: string; n: string };
  wallets: Record<string, VaultEntry>;
}

const KEY_LEN = 32;
const hex = (s: unknown, len?: number) => typeof s === 'string' && /^[0-9a-f]*$/.test(s) && s.length % 2 === 0 && (len === undefined || s.length === len);
const keyAad = (id: string) => utf8ToBytes(`kalyx-ext-vault|${id}|v1`);
const innerAad = (id: string, cred: string) => utf8ToBytes(`kalyx-ext-passkey|${id}|${cred}|v1`);
const CRED = /^[A-Za-z0-9_-]{16,1400}$/;
/** Sortie PRF (32 octets) + sel du coffre → clé de l'enveloppe intérieure. */
const prfKey = (prf: Uint8Array, salt: string) => hkdf(sha256, prf, hexToBytes(salt), utf8ToBytes('kalyx-ext-passkey-v1'), KEY_LEN);
const isPrf = (prf: unknown): prf is Uint8Array => prf instanceof Uint8Array && prf.length === KEY_LEN;
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
  // Avec passkey, l'extérieur emballe l'enveloppe intérieure (clé + étiquette GCM).
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

/**
 * Ajoute la passkey : il faut le mot de passe (l'extérieur est réemballé) ET
 * la clé de la session ouverte (elle doit être celle du coffre).
 */
export async function enablePasskey(vault: ExtVault, password: string, sessionKey: Uint8Array, p: { cred: string; salt: string; prf: Uint8Array }): Promise<ExtVault> {
  if (vault.passkey) throw new Error('PASSKEY_EXISTS');
  if (!CRED.test(p.cred) || !hex(p.salt, 64) || !isPrf(p.prf)) throw new Error('BAD_PASSKEY');
  const { plain, kek } = await openOuter(vault, password);
  const k = prfKey(p.prf, p.salt);
  try {
    if (!sameBytes(plain, sessionKey)) throw new Error('CORRUPTED');
    const n = getRandomBytes(12);
    const inner = gcm(k, n, innerAad(vault.id, p.cred)).encrypt(plain);
    return { ...vault, key: wrap(kek, vault.id, inner), passkey: { cred: p.cred, salt: p.salt, n: bytesToHex(n) } };
  } finally {
    plain.fill(0);
    kek.fill(0);
    k.fill(0);
  }
}

/** Retire la passkey : les deux facteurs une dernière fois, puis l'extérieur emballe de nouveau la clé seule. */
export async function disablePasskey(vault: ExtVault, password: string, prf: Uint8Array): Promise<ExtVault> {
  if (!vault.passkey) throw new Error('NO_PASSKEY');
  if (!isPrf(prf)) throw new Error('PASSKEY_REQUIRED');
  const { plain, kek } = await openOuter(vault, password);
  const k = prfKey(prf, vault.passkey.salt);
  let vaultKey: Uint8Array | null = null;
  try {
    try {
      vaultKey = gcm(k, hexToBytes(vault.passkey.n), innerAad(vault.id, vault.passkey.cred)).decrypt(plain);
    } catch {
      throw new Error('WRONG_PASSKEY');
    }
    const { passkey: _gone, ...rest } = vault;
    return { ...rest, key: wrap(kek, vault.id, vaultKey) };
  } finally {
    plain.fill(0);
    kek.fill(0);
    k.fill(0);
    vaultKey?.fill(0);
  }
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
  if (v.passkey || !v.byMain || !hex(v.byMain.n, 24) || !hex(v.byMain.ct, (KEY_LEN + 16) * 2)) throw new Error('CORRUPTED');
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
