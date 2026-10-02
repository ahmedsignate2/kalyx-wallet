/**
 * Stockage clé-valeur — implémentation NATIVE (iOS/Android).
 * Utilise expo-secure-store (chiffré, adossé au Keychain/Keystore).
 * La variante web (`kv.web.ts`) retombe sur localStorage.
 */
import * as SecureStore from 'expo-secure-store';
import { decoyMayRead, decoyMayWrite } from './sessionMode';

type Opts = SecureStore.SecureStoreOptions;

/** Comme les coffres : lisible seulement sur CET appareil, déverrouillé (jamais dans une sauvegarde iCloud/Google). */
export const KV_DEVICE_ONLY: Opts = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export function kvSet(key: string, value: string, opts?: Opts): Promise<void> {
  if (!decoyMayWrite(key)) return Promise.resolve(); // session leurre : rien par-dessus les vraies données
  return SecureStore.setItemAsync(key, value, opts);
}

export function kvGet(key: string, opts?: Opts): Promise<string | null> {
  if (!decoyMayRead(key)) return Promise.resolve(null); // session leurre : rien des vraies données
  return SecureStore.getItemAsync(key, opts);
}

export function kvDel(key: string, opts?: Opts): Promise<void> {
  if (!decoyMayWrite(key)) return Promise.resolve();
  return SecureStore.deleteItemAsync(key, opts);
}
