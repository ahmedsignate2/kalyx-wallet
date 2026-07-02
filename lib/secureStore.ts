/**
 * Persistance locale du wallet (device).
 *
 * Trois éléments distincts :
 *  1. Le COFFRE chiffré (AES+PIN) — le secret réel. Dans SecureStore.
 *  2. L'adresse publique — non sensible, pour afficher le solde même verrouillé.
 *  3. (Optionnel) une copie de la seed protégée par la BIOMÉTRIE de l'OS, pour
 *     un déverrouillage rapide. L'OS exige l'authentification avant de la rendre.
 *
 * La seed en clair n'est JAMAIS écrite en dehors de ces stockages chiffrés,
 * jamais loggée, jamais mise dans le state global.
 */
import * as SecureStore from 'expo-secure-store';
import { serializeVault, deserializeVault, type EncryptedVault } from '../src';

const K_VAULT = 'nova.vault'; // coffre AES+PIN
const K_ADDRESS = 'nova.address'; // adresse publique (non sensible)
const K_BIO_SEED = 'nova.bioSeed'; // seed protégée biométrie (optionnel)

const base: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const bioGated: SecureStore.SecureStoreOptions = {
  ...base,
  requireAuthentication: true, // l'OS impose biométrie/code avant lecture
};

export async function saveVault(vault: EncryptedVault): Promise<void> {
  await SecureStore.setItemAsync(K_VAULT, serializeVault(vault), base);
}

export async function loadVault(): Promise<EncryptedVault | null> {
  const raw = await SecureStore.getItemAsync(K_VAULT, base);
  return raw ? deserializeVault(raw) : null;
}

export async function hasVault(): Promise<boolean> {
  return (await SecureStore.getItemAsync(K_VAULT, base)) != null;
}

export async function savePublicAddress(address: string): Promise<void> {
  await SecureStore.setItemAsync(K_ADDRESS, address, base);
}

export async function loadPublicAddress(): Promise<string | null> {
  return SecureStore.getItemAsync(K_ADDRESS, base);
}

/** Active le déverrouillage biométrique en stockant la seed gated par l'OS. */
export async function enableBiometricSeed(mnemonic: string): Promise<void> {
  await SecureStore.setItemAsync(K_BIO_SEED, mnemonic, bioGated);
}

/** Lit la seed via biométrie (l'OS prompt). Renvoie null si non configurée. */
export async function readBiometricSeed(): Promise<string | null> {
  return SecureStore.getItemAsync(K_BIO_SEED, bioGated);
}

export async function wipeAll(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(K_VAULT, base),
    SecureStore.deleteItemAsync(K_ADDRESS, base),
    SecureStore.deleteItemAsync(K_BIO_SEED, bioGated),
  ]);
}
