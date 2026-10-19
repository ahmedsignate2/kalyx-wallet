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
 *  - un déverrouillage par passkey (v1.5) emballera la MÊME clé, autrement.
 *
 * Les briques sont celles du mobile, déjà auditées : dérivation scrypt avec
 * paramètres bornés (src/security/vault), scellement AES-GCM dont les données
 * associées lient chaque secret à SON coffre et à SON identifiant
 * (src/domain/backup/cloudBackup) — un secret recopié sous un autre nom ne
 * s'ouvre pas.
 *
 * Erreurs : `Error` dont le message est un code — WRONG_PASSWORD, CORRUPTED,
 * UNKNOWN_WALLET.
 */
import { gcm } from '@noble/ciphers/aes';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';
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
  /** Clé du coffre, emballée par la clé dérivée du mot de passe. */
  key: { n: string; ct: string };
  wallets: Record<string, VaultEntry>;
}

const KEY_LEN = 32;
const hex = (s: unknown, len?: number) => typeof s === 'string' && /^[0-9a-f]*$/.test(s) && s.length % 2 === 0 && (len === undefined || s.length === len);
const keyAad = (id: string) => utf8ToBytes(`kalyx-ext-vault|${id}|v1`);
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
  if (!v.key || !hex(v.key.n, 24) || !hex(v.key.ct, (KEY_LEN + 16) * 2)) throw new Error('CORRUPTED');
  if (!v.wallets || typeof v.wallets !== 'object') throw new Error('CORRUPTED');
  for (const [id, w] of Object.entries(v.wallets)) {
    if (!WALLET_ID.test(id) || (w?.kind !== 'seed' && w?.kind !== 'privateKey') || !hex(w.secret?.n, 24) || !hex(w.secret?.ct)) throw new Error('CORRUPTED');
  }
  return v;
}

/** Mot de passe → clé du coffre. `WRONG_PASSWORD` si l'authentification GCM échoue. */
export async function unlockVault(vault: ExtVault, password: string): Promise<Uint8Array> {
  const kek = await kekFor(password, vault.kdf);
  try {
    return gcm(kek, hexToBytes(vault.key.n), keyAad(vault.id)).decrypt(hexToBytes(vault.key.ct));
  } catch {
    throw new Error('WRONG_PASSWORD');
  } finally {
    kek.fill(0);
  }
}

/** Nouveau mot de passe : seule l'enveloppe change (nouveau sel), les secrets restent tels quels. */
export async function changeVaultPassword(vault: ExtVault, oldPassword: string, newPassword: string, params = EXT_KDF): Promise<ExtVault> {
  const vaultKey = await unlockVault(vault, oldPassword);
  const kdf = { name: 'scrypt' as const, ...params, salt: bytesToHex(getRandomBytes(16)) };
  const kek = await kekFor(newPassword, kdf);
  try {
    return { ...vault, kdf, key: wrap(kek, vault.id, vaultKey) };
  } finally {
    kek.fill(0);
    vaultKey.fill(0);
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
