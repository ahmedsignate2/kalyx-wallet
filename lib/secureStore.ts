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
import { serializeVault, deserializeVault, type EncryptedVault, type TonWalletVersion } from '../src';

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
/** Copie biométrique PROTÉGÉE par l'OS (nouveau schéma) et son témoin, lisible sans invite. */
const bioGatedKey = (id: string) => (id === 'primary' ? 'nova.bioSeedG' : `nova.bioSeedG.${id}`);
const bioFlagKey = (id: string) => (id === 'primary' ? 'nova.bioGated' : `nova.bioGated.${id}`);

/** Compte = index HD + adresses publiques par famille (aucune donnée sensible). */
export interface StoredAccount {
  index: number;
  label: string;
  evmAddress: string;
  btcAddress: string;
  /** Adresse Solana (base58). Optionnel : absent des comptes créés avant l'ajout de Solana. */
  solAddress?: string;
  /**
   * Clé publique TON (hex, 32 octets), et non une adresse : sur TON l'adresse
   * dépend de la version du contrat et du réseau (la W5 du réseau de test a une
   * autre adresse). Elle se recalcule sans secret à partir de cette clé.
   *
   * Absente des comptes d'avant TON (complétée au déverrouillage), et des comptes
   * d'index > 0 : Tonkeeper ne dérive qu'UNE clé TON par phrase, et c'est celle-ci
   * qu'on garantit identique.
   */
  tonPublicKey?: string;
  /** Version du contrat de portefeuille TON. Absente = W5 (`v5r1`), comme Tonkeeper. */
  tonVersion?: TonWalletVersion;
}

export interface WalletMeta {
  id: string;
  label: string;
  /**
   * Origine du coffre. `'seed'` (défaut, rétro-compat) = mnémonique BIP-39,
   * dérivation HD multi-comptes. `'privateKey'` = clé privée importée : un seul
   * compte, pas de dérivation HD, pas de phrase de récupération.
   *
   * `'tonPhrase'` = phrase Tonkeeper, qui n'est PAS une phrase BIP-39 : elle
   * n'ouvre QUE TON. Un type à part, et non `'seed'` avec un drapeau : partout,
   * « pas une clé privée » voulait dire « phrase BIP-39 », et une phrase TON
   * rangée comme `'seed'` aurait traversé la dérivation BIP-39 au déverrouillage
   * et à l'ajout de compte — des adresses EVM, Bitcoin et Solana qu'aucun autre
   * portefeuille ne montre pour cette phrase.
   */
  type?: 'seed' | 'privateKey' | 'tonPhrase';
  /**
   * Famille servie par une clé importée.
   *
   * ABSENT = `'evm'`, et c'est la rétro-compatibilité : tous les portefeuilles
   * importés avant l'ouverture aux autres chaînes sont EVM, et rien ne doit les
   * faire basculer ailleurs. Une clé importée ne sert QU'UNE famille — le secret
   * pourrait techniquement en servir plusieurs, mais l'adresse dérivée diffère à
   * chaque fois, et présenter plusieurs adresses pour un même import ne ferait
   * que semer le doute.
   */
  keyFamily?: 'evm' | 'bitcoin' | 'solana';
  /** Avatar de profil (« 3d:rocket », « flat:diamond » — lib/avatars.ts). Tiré au hasard à la création. */
  avatar?: string;
}

const base: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

// Tout premier schéma, sous la clé `bioKey` : secret gardé par le keystore
// (requireAuthentication). Sa clé ne survivait pas toujours à un nouveau build,
// et rien ne savait s'en remettre. Gardé seulement pour NETTOYER ces items.
const bioGated: SecureStore.SecureStoreOptions = {
  ...base,
  requireAuthentication: true,
};

/**
 * Options de la copie biométrique protégée : le système exige l'empreinte ou le
 * visage (jamais le code du téléphone) AVANT de rendre la valeur.
 */
const gatedOpts = (prompt?: string): SecureStore.SecureStoreOptions => ({
  ...base,
  requireAuthentication: true,
  ...(prompt ? { authenticationPrompt: prompt } : {}),
});

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

/** Comptes enregistrés : lève si l'enregistrement est illisible. */
function parseAccounts(raw: string): StoredAccount[] {
  const list = JSON.parse(raw) as unknown;
  if (!Array.isArray(list)) throw new Error('Comptes illisibles');
  return list as StoredAccount[];
}

/**
 * Comme `loadAccounts`, mais distingue « aucun enregistrement » (null) d'un
 * enregistrement ILLISIBLE (lève) : pour ne jamais répondre « pas à toi » sur
 * un portefeuille qu'on n'a pas pu lire.
 */
export async function loadAccountsStrict(id: string): Promise<StoredAccount[] | null> {
  const raw = await kvGet(accountsKey(id), base);
  return raw ? parseAccounts(raw) : null;
}

export async function loadAccounts(id: string): Promise<StoredAccount[] | null> {
  const raw = await kvGet(accountsKey(id), base);
  if (!raw) return null;
  try {
    return parseAccounts(raw);
  } catch {
    return null;
  }
}

/**
 * Copie biométrique de la phrase, PROTÉGÉE PAR L'OS.
 *
 * Elle était rangée en clair dans le Keystore, sans `requireAuthentication` : la
 * seule barrière était l'invite biométrique de l'app, et tout code exécuté dans
 * l'app pouvait la lire sans elle. Désormais le système refuse de la rendre sans
 * empreinte ou visage. L'écriture demande elle aussi le geste (Android).
 *
 * Ce qui avait fait abandonner ce schéma — une clé invalidée (nouvelle empreinte,
 * nouveau build) rendait la biométrie « cassée » — est géré : une lecture qui
 * rend `null` efface le témoin, l'app repasse au PIN, et `healBiometric`
 * réécrit la copie au déverrouillage suivant.
 *
 * Lève si l'OS refuse l'écriture (geste annulé) : rien n'est alors activé.
 */
export async function enableBiometricSeed(id: string, mnemonic: string, prompt?: string): Promise<void> {
  await kvSet(bioGatedKey(id), mnemonic, gatedOpts(prompt));
  await kvSet(bioFlagKey(id), '1', base);
  // L'ancienne copie en clair disparaît dès que la protégée existe.
  await kvDel(bioKey(id), base).catch(() => {});
}

export async function disableBiometricSeed(id: string): Promise<void> {
  await kvDel(bioFlagKey(id), base).catch(() => {});
  await kvDel(bioGatedKey(id), gatedOpts()).catch(() => {});
  await kvDel(bioKey(id), base).catch(() => {});
  // Nettoie aussi un éventuel tout premier item gated (migration).
  await kvDel(bioKey(id), bioGated).catch(() => {});
}

/** true si la copie biométrique est au schéma protégé (sa lecture demandera le geste). */
export async function isBiometricSeedGated(id: string): Promise<boolean> {
  try {
    return (await kvGet(bioFlagKey(id), base)) === '1';
  } catch {
    return false;
  }
}

/** true si une copie biométrique existe (protégée ou ancienne), sans rien demander à l'utilisateur. */
export async function hasBiometricSeed(id: string): Promise<boolean> {
  if (await isBiometricSeedGated(id)) return true;
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
 * Lit la copie biométrique.
 *
 *  - Schéma protégé : l'OS affiche lui-même l'invite. `null` = clé invalidée
 *    (nouvelle empreinte, nouveau build) : le témoin est effacé pour que
 *    `healBiometric` la réécrive au prochain PIN. LÈVE si l'utilisateur annule —
 *    la copie reste intacte, l'appelant repasse au PIN.
 *  - Ancien schéma (copie en clair) : l'invite est faite EN AMONT par l'appelant.
 */
export async function readBiometricSeed(id: string, prompt?: string): Promise<string | null> {
  if (await isBiometricSeedGated(id)) {
    const m = await kvGet(bioGatedKey(id), gatedOpts(prompt));
    if (m == null) await kvDel(bioFlagKey(id), base).catch(() => {});
    return m;
  }
  return readLegacyBiometricSeed(id);
}

/** Ancienne copie en clair, sans invite. Rend null si absente, jamais d'exception. */
export async function readLegacyBiometricSeed(id: string): Promise<string | null> {
  try {
    return await kvGet(bioKey(id), base);
  } catch {
    return null;
  }
}

/*
 * JOURNAL DU CHANGEMENT DE PIN. Les coffres sont réécrits un par un : une app
 * tuée au milieu laissait certains portefeuilles sous l'ancien PIN et d'autres
 * sous le nouveau — ceux-là devenaient illisibles avec le code en usage. Le
 * journal garde les coffres d'AVANT (chiffrés sous l'ancien PIN, rien de plus
 * sensible que ce qui était déjà là) le temps de l'écriture ; s'il existe au
 * lancement, l'opération n'a pas abouti et tout revient à l'ancien PIN.
 */
const K_PIN_CHANGE = 'nova.pinChangeJournal';

export async function savePinChangeJournal(before: { id: string; vault: EncryptedVault }[]): Promise<void> {
  await kvSet(K_PIN_CHANGE, JSON.stringify(before.map((b) => ({ id: b.id, vault: serializeVault(b.vault) }))), base);
}

export async function clearPinChangeJournal(): Promise<void> {
  await kvDel(K_PIN_CHANGE, base);
}

/** Remet les coffres d'avant un changement de PIN interrompu. Rend true s'il y en avait un. */
export async function rollbackPinChange(): Promise<boolean> {
  let raw: string | null;
  try {
    raw = await kvGet(K_PIN_CHANGE, base);
  } catch {
    return false;
  }
  if (!raw) return false;
  try {
    const entries = JSON.parse(raw) as { id: string; vault: string }[];
    for (const e of entries) await saveVault(e.id, deserializeVault(e.vault));
  } catch {
    // Journal illisible : on ne touche à rien de plus, les coffres restent tels quels.
  }
  await clearPinChangeJournal().catch(() => {});
  return true;
}

/** Supprime un portefeuille précis (coffre + comptes + biométrie). */
export async function wipeWallet(id: string): Promise<void> {
  await Promise.all([
    kvDel(vaultKey(id), base),
    kvDel(accountsKey(id), base),
    kvDel(bioKey(id), base).catch(() => {}),
    kvDel(bioKey(id), bioGated).catch(() => {}), // tout premier schéma
    kvDel(bioGatedKey(id), gatedOpts()).catch(() => {}),
    kvDel(bioFlagKey(id), base).catch(() => {}),
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
