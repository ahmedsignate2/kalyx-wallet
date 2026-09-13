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
import { kvSet, kvGet, kvDel } from './kv';
import { serializeVault, deserializeVault, type EncryptedVault } from '../src';

// ⚠️ Préfixe `nova.` CONSERVÉ après le renommage en Kalyx (2026-09-11) : ces clés
// adressent le coffre chiffré et les comptes déjà stockés sur les appareils. Les
// changer effacerait le wallet des installations existantes (ré-import obligatoire).
// Identifiants internes, jamais affichés.
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

// Ancien schéma : secret biométrique gardé par le keystore matériel
// (requireAuthentication). PROBLÈME : cette clé keystore ne survit pas toujours à
// un nouveau build/réinstallation → lecture qui échoue, biométrie « cassée » alors
// que le PIN marche. On garde bioGated seulement pour NETTOYER les anciens items.
const bioGated: SecureStore.SecureStoreOptions = {
  ...base,
  requireAuthentication: true,
};

export async function saveVault(id: string, vault: EncryptedVault): Promise<void> {
  await kvSet(vaultKey(id), serializeVault(vault), base);
}

export async function loadVault(id: string): Promise<EncryptedVault | null> {
  const raw = await kvGet(vaultKey(id), base);
  return raw ? deserializeVault(raw) : null;
}

export async function hasVault(id: string): Promise<boolean> {
  return (await kvGet(vaultKey(id), base)) != null;
}

export async function saveAccounts(id: string, accounts: StoredAccount[]): Promise<void> {
  await kvSet(accountsKey(id), JSON.stringify(accounts), base);
}

export async function loadAccounts(id: string): Promise<StoredAccount[] | null> {
  const raw = await kvGet(accountsKey(id), base);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredAccount[];
  } catch {
    return null;
  }
}

export async function enableBiometricSeed(id: string, mnemonic: string): Promise<void> {
  // Stockage NON-gated (WHEN_UNLOCKED_THIS_DEVICE_ONLY) : survit comme le coffre PIN.
  // L'accès est protégé par un prompt biométrique explicite (expo-local-authentication)
  // AVANT la lecture — un seul prompt, fiable sur tous les builds. Compromis assumé :
  // le secret n'est pas gated par le keystore matériel (voir walletStore.revealMnemonic).
  await kvSet(bioKey(id), mnemonic, base);
}

export async function disableBiometricSeed(id: string): Promise<void> {
  await kvDel(bioKey(id), base).catch(() => {});
  // Nettoie aussi un éventuel ancien item gated (migration).
  await kvDel(bioKey(id), bioGated).catch(() => {});
}

/** true si un secret biométrique (nouveau schéma) est présent pour ce wallet. */
export async function hasBiometricSeed(id: string): Promise<boolean> {
  try {
    return (await kvGet(bioKey(id), base)) != null;
  } catch {
    return false;
  }
}

/** Liste des portefeuilles (non sensible). */
export async function saveWalletsList(list: WalletMeta[]): Promise<void> {
  await kvSet(K_WALLETS, JSON.stringify(list), base);
}

export async function loadWalletsList(): Promise<WalletMeta[]> {
  const raw = await kvGet(K_WALLETS, base);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as WalletMeta[];
  } catch {
    return [];
  }
}

/** Carnet d'adresses. */
export async function saveContacts(list: unknown): Promise<void> {
  await kvSet(K_CONTACTS, JSON.stringify(list), base);
}

export async function loadContactsRaw(): Promise<string | null> {
  return kvGet(K_CONTACTS, base);
}

/** Préférences non sensibles (nom, langue, devise…). */
export async function saveSettings(obj: Record<string, unknown>): Promise<void> {
  await kvSet(K_SETTINGS, JSON.stringify(obj), base);
}

/**
 * Compteur anti-brute-force PERSISTANT : survit au redémarrage de l'app, pour
 * qu'on ne puisse pas contourner le verrouillage temporaire en la relançant.
 */
export async function saveLockState(failedAttempts: number, lastFailedAt: number): Promise<void> {
  await kvSet(K_LOCKSTATE, JSON.stringify({ failedAttempts, lastFailedAt }), base);
}

export async function loadLockState(): Promise<{ failedAttempts: number; lastFailedAt: number }> {
  try {
    const raw = await kvGet(K_LOCKSTATE, base);
    if (!raw) return { failedAttempts: 0, lastFailedAt: 0 };
    const s = JSON.parse(raw) as { failedAttempts?: number; lastFailedAt?: number };
    return { failedAttempts: Number(s.failedAttempts) || 0, lastFailedAt: Number(s.lastFailedAt) || 0 };
  } catch {
    return { failedAttempts: 0, lastFailedAt: 0 };
  }
}

export async function loadSettings(): Promise<Record<string, unknown> | null> {
  const raw = await kvGet(K_SETTINGS, base);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Tokens ajoutés manuellement, par chaîne : { chainId: [contract, …] }. */
export async function saveCustomTokens(map: Record<string, string[]>): Promise<void> {
  await kvSet(K_CUSTOM_TOKENS, JSON.stringify(map), base);
}

export async function loadCustomTokens(): Promise<Record<string, string[]>> {
  const raw = await kvGet(K_CUSTOM_TOKENS, base);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, string[]>;
  } catch {
    return {};
  }
}

const K_PRICE_ALERTS = 'nova.priceAlerts'; // alertes de prix (non sensible)

export async function savePriceAlerts(list: unknown[]): Promise<void> {
  await kvSet(K_PRICE_ALERTS, JSON.stringify(list), base);
}

export async function loadPriceAlerts<T>(): Promise<T[]> {
  const raw = await kvGet(K_PRICE_ALERTS, base);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

const K_TOKEN_PREFS = 'nova.tokenPrefs'; // tokens masqués/épinglés (non sensible)

export async function saveTokenPrefs(prefs: unknown): Promise<void> {
  await kvSet(K_TOKEN_PREFS, JSON.stringify(prefs), base);
}

export async function loadTokenPrefs<T>(fallback: T): Promise<T> {
  const raw = await kvGet(K_TOKEN_PREFS, base);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

const K_RECENTS = 'nova.recentRecipients'; // destinataires récents (adresses publiques)

export async function saveRecentRecipients(list: unknown[]): Promise<void> {
  await kvSet(K_RECENTS, JSON.stringify(list), base);
}

export async function loadRecentRecipients<T>(): Promise<T[]> {
  const raw = await kvGet(K_RECENTS, base);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

/**
 * Lit le secret biométrique (NON-gated). Le prompt biométrique est fait EN AMONT
 * par l'appelant (walletStore.revealMnemonic via expo-local-authentication).
 * Renvoie null si absent/illisible (jamais d'exception qui bloque l'UI).
 */
export async function readBiometricSeed(id: string): Promise<string | null> {
  try {
    return await kvGet(bioKey(id), base);
  } catch {
    return null;
  }
}

/** Supprime un portefeuille précis (coffre + comptes + biométrie). */
export async function wipeWallet(id: string): Promise<void> {
  await Promise.all([
    kvDel(vaultKey(id), base),
    kvDel(accountsKey(id), base),
    kvDel(bioKey(id), base).catch(() => {}),
    kvDel(bioKey(id), bioGated).catch(() => {}), // ancien schéma
  ]);
}

/** Réinitialisation totale (tous les portefeuilles + la liste). */
export async function wipeAll(list: WalletMeta[]): Promise<void> {
  await Promise.all([
    ...list.map((w) => wipeWallet(w.id)),
    wipeWallet('primary'),
    kvDel(K_WALLETS, base),
  ]);
}
