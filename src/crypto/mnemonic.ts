/**
 * Phrase de récupération BIP-39.
 *
 * On s'appuie sur @scure/bip39 (audité, zéro dépendance). On n'implémente
 * jamais de crypto soi-même. La seed / le mnémonique ne doivent jamais être
 * loggés ni transmis sur le réseau.
 */
import {
  generateMnemonic as scureGenerate,
  mnemonicToSeed as scureToSeed,
  mnemonicToSeedSync as scureToSeedSync,
  validateMnemonic as scureValidate,
  entropyToMnemonic as scureEntropyToMnemonic,
} from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';

/** 128 bits = 12 mots, 256 bits = 24 mots. */
export type MnemonicStrength = 128 | 256;

/** Génère une nouvelle phrase BIP-39 (aléatoire sûr fourni par @scure). */
export function generateMnemonic(strength: MnemonicStrength = 128): string {
  return scureGenerate(wordlist, strength);
}

/** Valide une phrase (mots dans la liste + checksum correct). */
export function validateMnemonic(mnemonic: string): boolean {
  return scureValidate(normalize(mnemonic), wordlist);
}

/** Dérive la seed binaire (async). */
export async function mnemonicToSeed(
  mnemonic: string,
  passphrase = '',
): Promise<Uint8Array> {
  return scureToSeed(normalize(mnemonic), passphrase);
}

/** Variante synchrone (utile en test / hors chemin UI critique). */
export function mnemonicToSeedSync(
  mnemonic: string,
  passphrase = '',
): Uint8Array {
  return scureToSeedSync(normalize(mnemonic), passphrase);
}

/** Reconstruit une phrase à partir d'une entropie (utile pour les tests). */
export function entropyToMnemonic(entropy: Uint8Array): string {
  return scureEntropyToMnemonic(entropy, wordlist);
}

/** Nettoie la saisie utilisateur : trim + espaces multiples + minuscules. */
function normalize(mnemonic: string): string {
  return mnemonic.trim().replace(/\s+/g, ' ').toLowerCase();
}
