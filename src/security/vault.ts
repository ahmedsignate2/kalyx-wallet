/**
 * Coffre chiffré pour la seed.
 *
 * Défense en profondeur : en plus du secure storage matériel (Keychain /
 * Keystore), on chiffre la seed avec **AES-256-GCM**, sous une clé dérivée du
 * **PIN de l'utilisateur** via **scrypt** (KDF mémoire-dure = résistante au
 * brute-force). Un mauvais PIN fait échouer l'authentification GCM : on ne peut
 * pas déchiffrer, et on ne révèle rien.
 *
 * Le texte en clair (seed) ne doit exister qu'en mémoire, le temps de l'usage,
 * et n'est jamais loggé.
 */
import { gcm } from '@noble/ciphers/aes';
import { scryptAsync } from '@noble/hashes/scrypt';
import { utf8ToBytes, bytesToUtf8, bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { getRandomBytes } from '../crypto/random';
import { WalletError } from '../domain/errors';

export interface EncryptedVault {
  v: 1;
  kdf: 'scrypt';
  /** Paramètres scrypt stockés pour compatibilité ascendante. */
  N: number;
  r: number;
  p: number;
  salt: string; // hex
  nonce: string; // hex (12 octets, GCM)
  ct: string; // hex (ciphertext + tag GCM)
}

// N=2^14 : bon compromis sécurité/latence sur mobile. Ajustable via les
// paramètres stockés dans le coffre.
const DEFAULT_KDF = { N: 1 << 14, r: 8, p: 1, dkLen: 32 };
/** Paramètres plus coûteux pour les exports hors ligne (attaque par dictionnaire). */
// Mesuré sur mobile : 2^17 peut ne jamais rendre la main sur certains
// appareils. Les paramètres restent stockés dans chaque export.
export const BACKUP_KDF = { N: 1 << 15, r: 8, p: 1, dkLen: 32 };

async function deriveKey(
  pin: string,
  salt: Uint8Array,
  params: { N: number; r: number; p: number },
): Promise<Uint8Array> {
  const startedAt = Date.now();
  console.log('[KALYX-AUTH][scrypt] start', {
    N: params.N,
    r: params.r,
    p: params.p,
    asyncTickMs: 120,
  });
  try {
    const key = await scryptAsync(utf8ToBytes(pin.normalize('NFKC')), salt, {
      N: params.N,
      r: params.r,
      p: params.p,
      dkLen: DEFAULT_KDF.dkLen,
      // scrypt rend la main tous les `asyncTick` ms pour ne pas figer l'UI.
      asyncTick: 120,
    });
    console.log('[KALYX-AUTH][scrypt] resolved', {
      N: params.N,
      elapsedMs: Date.now() - startedAt,
    });
    return key;
  } catch (error) {
    console.warn('[KALYX-AUTH][scrypt] rejected', {
      N: params.N,
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/** Chiffre un secret (seed) sous le PIN. Sel + nonce aléatoires à chaque appel. */
export async function encryptSecret(
  plaintext: string,
  pin: string,
  kdf: { N: number; r: number; p: number } = DEFAULT_KDF,
): Promise<EncryptedVault> {
  console.log('[KALYX-AUTH][vault] encrypt:start', { kdf: { N: kdf.N, r: kdf.r, p: kdf.p } });
  const salt = getRandomBytes(16);
  const nonce = getRandomBytes(12);
  const key = await deriveKey(pin, salt, kdf);
  const ct = gcm(key, nonce).encrypt(utf8ToBytes(plaintext));
  console.log('[KALYX-AUTH][vault] encrypt:resolved', { ciphertextBytes: ct.length });
  return {
    v: 1,
    kdf: 'scrypt',
    N: kdf.N,
    r: kdf.r,
    p: kdf.p,
    salt: bytesToHex(salt),
    nonce: bytesToHex(nonce),
    ct: bytesToHex(ct),
  };
}

/** Déchiffre. Lève WRONG_PIN si le PIN est faux (échec d'auth GCM). */
export async function decryptSecret(
  vault: EncryptedVault,
  pin: string,
): Promise<string> {
  console.log('[KALYX-AUTH][vault] decrypt:start', { N: vault.N, r: vault.r, p: vault.p });
  if (vault.v !== 1 || vault.kdf !== 'scrypt') {
    throw new WalletError('VAULT_CORRUPTED', 'Format de coffre non supporté');
  }
  const key = await deriveKey(pin, hexToBytes(vault.salt), vault);
  try {
    const pt = gcm(key, hexToBytes(vault.nonce)).decrypt(hexToBytes(vault.ct));
    // bytesToUtf8 (lib auditée) au lieu de TextDecoder, absent sur Hermes/Android.
    const plaintext = bytesToUtf8(pt);
    console.log('[KALYX-AUTH][vault] decrypt:resolved');
    return plaintext;
  } catch {
    // GCM échoue si PIN faux OU données altérées : on ne distingue pas.
    console.warn('[KALYX-AUTH][vault] decrypt:authentication-failed');
    throw new WalletError('WRONG_PIN', 'PIN incorrect');
  }
}

/** Sérialisation pour SecureStore (string). */
export function serializeVault(vault: EncryptedVault): string {
  return JSON.stringify(vault);
}

export function deserializeVault(raw: string): EncryptedVault {
  try {
    return JSON.parse(raw) as EncryptedVault;
  } catch {
    throw new WalletError('VAULT_CORRUPTED', 'Coffre illisible');
  }
}
