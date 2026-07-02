/**
 * Stockage sécurisé du mnémonique.
 *
 * expo-secure-store s'appuie sur le Keychain (iOS) / Keystore (Android) :
 * le secret est chiffré au niveau matériel. On y accède derrière la biométrie
 * / le code de l'appareil.
 *
 * DURCISSEMENT PRÉVU (roadmap phase 1/5, cf. SECURITY.md) : ajouter une couche
 * AES-GCM applicative avec une clé dérivée d'un PIN choisi par l'utilisateur,
 * pour ne pas dépendre uniquement du secure storage OS. Marqué TODO ci-dessous.
 */
import * as SecureStore from 'expo-secure-store';

const MNEMONIC_KEY = 'nova.wallet.mnemonic';

const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  // requireAuthentication: true, // à activer avec un écran de secours PIN
};

export async function saveMnemonic(mnemonic: string): Promise<void> {
  // TODO(sécurité): chiffrer en AES-GCM avec une clé dérivée du PIN avant stockage.
  await SecureStore.setItemAsync(MNEMONIC_KEY, mnemonic, options);
}

export async function loadMnemonic(): Promise<string | null> {
  return SecureStore.getItemAsync(MNEMONIC_KEY, options);
}

export async function hasMnemonic(): Promise<boolean> {
  return (await SecureStore.getItemAsync(MNEMONIC_KEY, options)) != null;
}

export async function wipeMnemonic(): Promise<void> {
  await SecureStore.deleteItemAsync(MNEMONIC_KEY, options);
}
