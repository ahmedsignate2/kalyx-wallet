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
const K_ACCOUNTS = 'nova.accounts'; // comptes publics (adresses, non sensible)
const K_BIO_SEED = 'nova.bioSeed'; // seed protégée biométrie (optionnel)
const K_SETTINGS = 'nova.settings'; // préférences (non sensible)
const K_CUSTOM_TOKENS = 'nova.customTokens'; // tokens ajoutés par contrat (non sensible)

/** Compte = index HD + adresses publiques par famille (aucune donnée sensible). */
export interface StoredAccount {
  index: number;
  label: string;
  evmAddress: string;
  btcAddress: string;
}

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

export async function saveAccounts(accounts: StoredAccount[]): Promise<void> {
  await SecureStore.setItemAsync(K_ACCOUNTS, JSON.stringify(accounts), base);
}

export async function loadAccounts(): Promise<StoredAccount[] | null> {
  const raw = await SecureStore.getItemAsync(K_ACCOUNTS, base);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredAccount[];
  } catch {
    return null;
  }
}

/** Active le déverrouillage biométrique en stockant la seed gated par l'OS. */
export async function enableBiometricSeed(mnemonic: string): Promise<void> {
  await SecureStore.setItemAsync(K_BIO_SEED, mnemonic, bioGated);
}

/** Désactive le déverrouillage biométrique (supprime la seed gated). */
export async function disableBiometricSeed(): Promise<void> {
  await SecureStore.deleteItemAsync(K_BIO_SEED, bioGated);
}

/** Préférences non sensibles (nom, langue, devise…). */
export async function saveSettings(obj: Record<string, unknown>): Promise<void> {
  await SecureStore.setItemAsync(K_SETTINGS, JSON.stringify(obj), base);
}

export async function loadSettings(): Promise<Record<string, unknown> | null> {
  const raw = await SecureStore.getItemAsync(K_SETTINGS, base);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Tokens ajoutés manuellement, par chaîne : { chainId: [contract, …] }. */
export async function saveCustomTokens(map: Record<string, string[]>): Promise<void> {
  await SecureStore.setItemAsync(K_CUSTOM_TOKENS, JSON.stringify(map), base);
}

export async function loadCustomTokens(): Promise<Record<string, string[]>> {
  const raw = await SecureStore.getItemAsync(K_CUSTOM_TOKENS, base);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, string[]>;
  } catch {
    return {};
  }
}

/** Lit la seed via biométrie (l'OS prompt). Renvoie null si non configurée. */
export async function readBiometricSeed(): Promise<string | null> {
  return SecureStore.getItemAsync(K_BIO_SEED, bioGated);
}

export async function wipeAll(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(K_VAULT, base),
    SecureStore.deleteItemAsync(K_ACCOUNTS, base),
    SecureStore.deleteItemAsync(K_BIO_SEED, bioGated),
  ]);
}
