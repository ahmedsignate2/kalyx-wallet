/**
 * TON — de la phrase à la clé, EXACTEMENT comme Tonkeeper.
 *
 * ## La règle, relue dans le code de Tonkeeper
 *
 * `tonkeeper-web/packages/core/src/service/mnemonicService.ts`,
 * `resolveMnemonicType` puis `mnemonicToKeypair` :
 *
 * 1. Si la phrase est une phrase TON valide (`mnemonicValidate` de `@ton/crypto`)
 *    → dérivation NATIVE (`tonMnemonic.ts`).
 * 2. Sinon, si c'est une phrase BIP-39 valide → graine BIP-39 SANS passphrase,
 *    puis SLIP-0010 ed25519 sur `m/44'/607'/0'`.
 * 3. Sinon, invalide.
 *
 * L'ORDRE compte. Une phrase BIP-39 de 12 mots passe le contrôle TON environ une
 * fois sur 256 — le contrôle TON ne regarde pas la longueur. Tonkeeper la traite
 * alors en native. Tester BIP-39 d'abord la ferait dériver autrement, donc vers
 * une autre adresse : l'utilisateur verrait un portefeuille vide ici ou là-bas.
 *
 * ## Pourquoi pas la native pour tout
 *
 * La première version de `docs/10-TON.md` le prévoyait. Toutes les phrases que
 * Kalyx crée sont BIP-39 : avec la native, leur adresse TON n'aurait pas été
 * celle que Tonkeeper montre pour la même phrase. Le piège que la doc voulait
 * éviter, dans l'autre sens.
 *
 * Validé contre les vecteurs officiels de `@ton/crypto` et contre la fonction
 * de chemin de Tonkeeper, recopiée à l'identique pour produire les vecteurs de
 * test (voir `tonKeys.test.ts`).
 */
import { ed25519 } from '@noble/curves/ed25519';
import { mnemonicToSeedSync, validateMnemonic } from '../../../crypto/mnemonic';
import { deriveEd25519 } from '../../../crypto/slip10';
import { isValidTonMnemonic, tonSeedFromMnemonic } from './tonMnemonic';

/** Chemin SLIP-0010 d'une phrase BIP-39 sur TON — celui de Tonkeeper. */
export const TON_BIP39_PATH = "m/44'/607'/0'";

/** `ton` : phrase TON, dérivation native. `bip39` : SLIP-0010 sur `TON_BIP39_PATH`. */
export type TonKeyKind = 'ton' | 'bip39';

export interface TonKey {
  kind: TonKeyKind;
  /** Graine ed25519 de 32 octets. SECRET : à effacer par l'appelant. */
  seed: Uint8Array;
  /** Clé publique ed25519 (32 octets). */
  publicKey: Uint8Array;
}

/**
 * Quelle dérivation Tonkeeper appliquerait à cette phrase, ou `null` si elle
 * n'est valide ni en TON ni en BIP-39.
 */
export function tonKeyKind(phrase: string): TonKeyKind | null {
  if (isValidTonMnemonic(phrase)) return 'ton';
  if (validateMnemonic(phrase)) return 'bip39';
  return null;
}

/**
 * Clé TON d'une phrase.
 *
 * Pas de passphrase BIP-39 : Tonkeeper n'en passe pas. Avec une passphrase,
 * l'adresse ne correspondrait plus à celle de Tonkeeper, et c'est précisément
 * la correspondance qu'on garantit ici.
 */
export function resolveTonKey(phrase: string): TonKey {
  const kind = tonKeyKind(phrase);
  if (kind === 'ton') {
    const seed = tonSeedFromMnemonic(phrase);
    return { kind, seed, publicKey: ed25519.getPublicKey(seed) };
  }
  if (kind === 'bip39') {
    const bip39Seed = mnemonicToSeedSync(phrase);
    try {
      const { key } = deriveEd25519(bip39Seed, [44, 607, 0]);
      return { kind, seed: key, publicKey: ed25519.getPublicKey(key) };
    } finally {
      bip39Seed.fill(0);
    }
  }
  throw new Error('Phrase invalide : ni phrase TON ni phrase BIP-39');
}
