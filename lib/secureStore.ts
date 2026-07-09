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

const K_SETTINGS = 'nova.settings'; // préférences (non sensible)
const K_LOCKSTATE = 'nova.lockState'; // anti-brute-force (persistant, résiste au redémarrage)
const K_CUSTOM_TOKENS = 'nova.customTokens'; // tokens ajoutés par contrat (non sensible)
const K_WALLETS = 'nova.wallets'; // liste des portefeuilles [{id,label}]
const K_CONTACTS = 'nova.contacts'; // carnet d'adresses (non sensible)

/**
 * Clés PAR portefeuille. Le wallet 'primary' garde les clés HISTORIQUES
 * (nova.vault / nova.accounts / nova.bioSeed) → aucune migration destructive :
 * le portefeuille existant reste intact. Les autres wallets sont suffixés.
 */
const vaultKey = (id: string) => (id === 'primary' ? 'nova.vault' : `nova.vault.${id}`);
const accountsKey = (id: string) => (id === 'primary' ? 'nova.accounts' : `nova.accounts.${id}`);
const bioKey = (id: string) => (id === 'primary' ? 'nova.bioSeed' : `nova.bioSeed.${id}`);

/** Compte = index HD + adresses publiques par famille (aucune donnée sensible). */
export interface StoredAccount {
  index: number;
  label: string;
  evmAddress: string;
  btcAddress: string;
  /** Adresse Solana (base58). Optionnel : absent des comptes créés avant l'ajout de Solana. */
  solAddress?: string;
}

export interface WalletMeta {
  id: string;
  label: string;
  /**
   * Origine du coffre. `'seed'` (défaut, rétro-compat) = mnémonique BIP-39,
   * dérivation HD multi-comptes. `'privateKey'` = clé privée EVM importée :
   * un seul compte, pas de dérivation HD, EVM uniquement (ni phrase, ni BTC/Solana).
   */
  type?: 'seed' | 'privateKey';
}

const base: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const bioGated: SecureStore.SecureStoreOptions = {
  ...base,
  requireAuthentication: true, // l'OS impose biométrie/code avant lecture
};

export async function saveVault(id: string, vault: EncryptedVault): Promise<void> {
  await SecureStore.setItemAsync(vaultKey(id), serializeVault(vault), base);
}

export async function loadVault(id: string): Promise<EncryptedVault | null> {
  const raw = await SecureStore.getItemAsync(vaultKey(id), base);
  return raw ? deserializeVault(raw) : null;
}

export async function hasVault(id: string): Promise<boolean> {
  return (await SecureStore.getItemAsync(vaultKey(id), base)) != null;
}

export async function saveAccounts(id: string, accounts: StoredAccount[]): Promise<void> {
  await SecureStore.setItemAsync(accountsKey(id), JSON.stringify(accounts), base);
}

export async function loadAccounts(id: string): Promise<StoredAccount[] | null> {
  const raw = await SecureStore.getItemAsync(accountsKey(id), base);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredAccount[];
  } catch {
    return null;
  }
}

export async function enableBiometricSeed(id: string, mnemonic: string): Promise<void> {
  await SecureStore.setItemAsync(bioKey(id), mnemonic, bioGated);
}

export async function disableBiometricSeed(id: string): Promise<void> {
  await SecureStore.deleteItemAsync(bioKey(id), bioGated);
}

/** Liste des portefeuilles (non sensible). */
export async function saveWalletsList(list: WalletMeta[]): Promise<void> {
  await SecureStore.setItemAsync(K_WALLETS, JSON.stringify(list), base);
}

export async function loadWalletsList(): Promise<WalletMeta[]> {
  const raw = await SecureStore.getItemAsync(K_WALLETS, base);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as WalletMeta[];
  } catch {
    return [];
  }
}

/** Carnet d'adresses. */
export async function saveContacts(list: unknown): Promise<void> {
  await SecureStore.setItemAsync(K_CONTACTS, JSON.stringify(list), base);
}

export async function loadContactsRaw(): Promise<string | null> {
  return SecureStore.getItemAsync(K_CONTACTS, base);
}

/** Préférences non sensibles (nom, langue, devise…). */
export async function saveSettings(obj: Record<string, unknown>): Promise<void> {
  await SecureStore.setItemAsync(K_SETTINGS, JSON.stringify(obj), base);
}

/**
 * Compteur anti-brute-force PERSISTANT : survit au redémarrage de l'app, pour
 * qu'on ne puisse pas contourner le verrouillage temporaire en la relançant.
 */
export async function saveLockState(failedAttempts: number, lastFailedAt: number): Promise<void> {
  await SecureStore.setItemAsync(K_LOCKSTATE, JSON.stringify({ failedAttempts, lastFailedAt }), base);
}

export async function loadLockState(): Promise<{ failedAttempts: number; lastFailedAt: number }> {
  try {
    const raw = await SecureStore.getItemAsync(K_LOCKSTATE, base);
    if (!raw) return { failedAttempts: 0, lastFailedAt: 0 };
    const s = JSON.parse(raw) as { failedAttempts?: number; lastFailedAt?: number };
    return { failedAttempts: Number(s.failedAttempts) || 0, lastFailedAt: Number(s.lastFailedAt) || 0 };
  } catch {
    return { failedAttempts: 0, lastFailedAt: 0 };
  }
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
export async function readBiometricSeed(id: string): Promise<string | null> {
  return SecureStore.getItemAsync(bioKey(id), bioGated);
}

/** Supprime un portefeuille précis (coffre + comptes + biométrie). */
export async function wipeWallet(id: string): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(vaultKey(id), base),
    SecureStore.deleteItemAsync(accountsKey(id), base),
    SecureStore.deleteItemAsync(bioKey(id), bioGated),
  ]);
}

/** Réinitialisation totale (tous les portefeuilles + la liste). */
export async function wipeAll(list: WalletMeta[]): Promise<void> {
  await Promise.all([
    ...list.map((w) => wipeWallet(w.id)),
    wipeWallet('primary'),
    SecureStore.deleteItemAsync(K_WALLETS, base),
  ]);
}
