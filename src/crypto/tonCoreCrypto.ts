/**
 * Ce que `@ton/core` attend de `@ton/crypto` — et rien d'autre.
 *
 * ## Pourquoi remplacer `@ton/crypto`
 *
 * `@ton/core` (cellules, BOC, messages) dépend de `@ton/crypto`. Sur React
 * Native, celui-ci charge sa variante mobile, qui exige le module NATIF
 * `react-native-fast-pbkdf2` dès l'import. Kalyx ne l'a pas : le build
 * échouerait. L'ajouter voudrait dire un module natif de plus, sans garantie de
 * compatibilité avec notre version de React Native, pour un PBKDF2 dont on n'a
 * pas besoin — la dérivation TON passe déjà par `@noble` (`tonMnemonic.ts`).
 *
 * `@ton/core` n'appelle que TROIS fonctions de `@ton/crypto` : `sha256_sync`
 * (hachage des cellules, donc des adresses et des messages), `sign` et
 * `signVerify` (signatures « à domaine », qu'on n'utilise pas mais qui doivent
 * exister). Les voici, sur `@noble` — déjà audité et déjà dans l'app.
 *
 * Branché à la place de `@ton/crypto` dans `metro.config.js` ET `jest.config.js` :
 * les tests exécutent donc exactement ce que l'app exécute, et comparent le
 * résultat aux BOC produits par les bibliothèques officielles. Un test vérifie
 * aussi que `@ton/core` n'appelle aucune autre fonction : une mise à jour qui en
 * utiliserait une nouvelle échouerait en CI, pas chez un utilisateur.
 *
 * Attention : `@ton/core` appelle `sha256_sync` dès le CHARGEMENT d'un de ses
 * modules (`domainSignature.js`). Ce fichier doit donc rester sans effet de
 * bord et sans dépendance circulaire.
 */
import { Buffer } from 'buffer';
import { sha256 } from '@noble/hashes/sha256';
import { ed25519 } from '@noble/curves/ed25519';

const bytes = (src: Buffer | Uint8Array | string): Uint8Array => (typeof src === 'string' ? Buffer.from(src, 'utf8') : src);

/** SHA-256 synchrone. Une chaîne est lue en UTF-8, comme dans `@ton/crypto`. */
export function sha256_sync(source: Buffer | Uint8Array | string): Buffer {
  return Buffer.from(sha256(bytes(source)));
}

/**
 * Signature ed25519. `secretKey` au format tweetnacl de `@ton/crypto` : 64
 * octets, la graine puis la clé publique — seuls les 32 premiers servent.
 */
export function sign(data: Buffer | Uint8Array, secretKey: Buffer | Uint8Array): Buffer {
  if (secretKey.length !== 64 && secretKey.length !== 32) throw new Error('Clé secrète ed25519 invalide');
  return Buffer.from(ed25519.sign(data, secretKey.subarray(0, 32)));
}

/** Vérification d'une signature ed25519. */
export function signVerify(data: Buffer | Uint8Array, signature: Buffer | Uint8Array, publicKey: Buffer | Uint8Array): boolean {
  try {
    return ed25519.verify(signature, data, publicKey);
  } catch {
    return false;
  }
}
