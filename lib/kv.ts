/**
 * Stockage clé-valeur — implémentation NATIVE (iOS/Android).
 * Utilise expo-secure-store (chiffré, adossé au Keychain/Keystore).
 * La variante web (`kv.web.ts`) retombe sur localStorage.
 */
import * as SecureStore from 'expo-secure-store';

type Opts = SecureStore.SecureStoreOptions;

export function kvSet(key: string, value: string, opts?: Opts): Promise<void> {
  return SecureStore.setItemAsync(key, value, opts);
}

export function kvGet(key: string, opts?: Opts): Promise<string | null> {
  return SecureStore.getItemAsync(key, opts);
}

export function kvDel(key: string, opts?: Opts): Promise<void> {
  return SecureStore.deleteItemAsync(key, opts);
}
