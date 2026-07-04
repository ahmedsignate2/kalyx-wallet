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

async function deriveKey(
  pin: string,
  salt: Uint8Array,
  params: { N: number; r: number; p: number },
): Promise<Uint8Array> {
  return scryptAsync(utf8ToBytes(pin.normalize('NFKC')), salt, {
    N: params.N,
    r: params.r,
    p: params.p,
    dkLen: DEFAULT_KDF.dkLen,
    // scrypt rend la main tous les `asyncTick` ms pour ne pas figer l'UI. Le
    // défaut (10 ms) provoque des dizaines de reprises, chacune COÛTEUSE sur
    // Hermes/RN → l'essentiel de la latence de déverrouillage vient de là (pas
    // du calcul). On monte à 120 ms : bien moins de reprises, donc bien plus
    // rapide, tout en gardant l'UI fluide (blocage ≤ 120 ms par salve). AUCUN
    // impact sécurité : N/r/p sont inchangés.
    asyncTick: 120,
  });
}

/** Chiffre un secret (seed) sous le PIN. Sel + nonce aléatoires à chaque appel. */
export async function encryptSecret(
  plaintext: string,
  pin: string,
): Promise<EncryptedVault> {
  const salt = getRandomBytes(16);
  const nonce = getRandomBytes(12);
  const key = await deriveKey(pin, salt, DEFAULT_KDF);
  const ct = gcm(key, nonce).encrypt(utf8ToBytes(plaintext));
  return {
    v: 1,
    kdf: 'scrypt',
    N: DEFAULT_KDF.N,
    r: DEFAULT_KDF.r,
    p: DEFAULT_KDF.p,
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
  if (vault.v !== 1 || vault.kdf !== 'scrypt') {
    throw new WalletError('VAULT_CORRUPTED', 'Format de coffre non supporté');
  }
  const key = await deriveKey(pin, hexToBytes(vault.salt), vault);
  try {
    const pt = gcm(key, hexToBytes(vault.nonce)).decrypt(hexToBytes(vault.ct));
    // bytesToUtf8 (lib auditée) au lieu de TextDecoder, absent sur Hermes/Android.
    return bytesToUtf8(pt);
  } catch {
    // GCM échoue si PIN faux OU données altérées : on ne distingue pas.
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
