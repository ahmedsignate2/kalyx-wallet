/**
 * TON — dérivation NATIVE d'une phrase TON, et contrôle de validité.
 *
 * ## Quand elle s'applique
 *
 * Seulement aux PHRASES TON, celles que créent Tonkeeper, TonHub et le
 * portefeuille officiel. Une phrase BIP-39 — toutes celles que Kalyx crée, et
 * celles de MetaMask ou Trust — passe par SLIP-0010 sur `m/44'/607'/0'`. Le choix
 * entre les deux n'est pas le nôtre : c'est celui de Tonkeeper, relu dans son
 * code (`mnemonicService.ts`), et il est reproduit dans `tonKeys.ts`. Appliquer la
 * native à tout aurait fait voir un portefeuille vide à quiconque importe sa
 * phrase Kalyx dans Tonkeeper. Voir `docs/10-TON.md` §1.
 *
 * ## L'algorithme, écrit noir sur blanc
 *
 * Chaque constante compte — un sel ou un nombre d'itérations erroné produit une
 * clé valide pour une adresse qui n'est pas celle de l'utilisateur :
 *
 * 1. `entropie = HMAC-SHA512(clé = mots joints par une espace, données = mot de passe)`
 *    — noter l'inversion : la phrase est la CLÉ du HMAC, pas les données.
 * 2. `graine = PBKDF2-SHA512(entropie, sel = "TON default seed", 100 000 itérations, 64 octets)`
 * 3. La clé ed25519 est constituée des **32 premiers octets** de cette graine.
 *
 * La validité d'une phrase TON n'est PAS celle de BIP-39 : il n'y a pas de somme
 * de contrôle sur les mots. Une phrase est valide si tous ses mots sont dans la
 * liste et si `PBKDF2-SHA512(entropie, "TON seed version", 100000/256)` commence
 * par un octet nul — d'où les générateurs TON qui tirent en boucle.
 *
 * ## Validé contre les vecteurs officiels
 *
 * Les cinq vecteurs publiés par `@ton/crypto` (phrase → clé) sont dans les tests,
 * et le contrôle de validité reproduit `mnemonicValidate` à l'identique, y compris
 * ce qu'il NE vérifie PAS : le nombre de mots. Une phrase BIP-39 de 12 mots peut
 * donc être une phrase TON valide (une fois sur 256 environ), et Tonkeeper la
 * traite alors comme telle. Notre version exigeait 24 mots : pour ces phrases,
 * elle aurait choisi l'autre dérivation, donc une autre adresse.
 */
import { hmac } from '@noble/hashes/hmac';
import { sha512 } from '@noble/hashes/sha2';
import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { utf8ToBytes } from '@noble/hashes/utils';
import { wordlist } from '@scure/bip39/wordlists/english';

/** Sel de la dérivation de clé. */
const SALT_KEYSTORE = 'TON default seed';
/** Sel du contrôle de validité d'une phrase. */
const SALT_SEED_VERSION = 'TON seed version';
/** Sel du contrôle « cette phrase attend-elle un mot de passe ? ». */
const SALT_PASSWORD_VERSION = 'TON fast seed version';
/** Itérations de la dérivation. Fixé par TON, pas un réglage. */
const ITERATIONS = 100_000;

/**
 * Nombre de mots d'une phrase TON GÉNÉRÉE. Ce n'est PAS une condition de
 * validité : `@ton/crypto` ne vérifie pas la longueur, et Tonkeeper non plus.
 */
export const TON_MNEMONIC_WORDS = 24;

/** La liste de mots TON est celle de BIP-39 en anglais. */
const WORDS = new Set(wordlist);

/** Normalise une phrase en liste de mots minuscules, sans espaces superflus. */
export function tonWords(mnemonic: string): string[] {
  return (mnemonic ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * Entropie d'une phrase.
 *
 * La phrase est la CLÉ du HMAC et le mot de passe les DONNÉES. C'est contre
 * l'intuition — on attendrait l'inverse — et les inverser produit une entropie
 * parfaitement valide pour une clé qui n'est pas la bonne.
 */
function mnemonicToEntropy(words: string[], password = ''): Uint8Array {
  return hmac(sha512, utf8ToBytes(words.join(' ')), utf8ToBytes(password));
}

/** `is_basic_seed` de tonlib : itérations `max(1, 100000/256)`, premier octet nul. */
function isBasicSeed(entropy: Uint8Array): boolean {
  const h = pbkdf2(sha512, entropy, utf8ToBytes(SALT_SEED_VERSION), { c: Math.max(1, Math.floor(ITERATIONS / 256)), dkLen: 64 });
  return h[0] === 0;
}

/** `is_password_seed` de tonlib : une itération, premier octet à 1. */
function isPasswordSeed(entropy: Uint8Array): boolean {
  const h = pbkdf2(sha512, entropy, utf8ToBytes(SALT_PASSWORD_VERSION), { c: 1, dkLen: 64 });
  return h[0] === 1;
}

/**
 * Cette phrase attend-elle un mot de passe ?
 *
 * Un détail qui compte à l'import : une phrase protégée par mot de passe est
 * INVALIDE sans lui, et refuser une phrase correcte sans expliquer qu'il manque
 * un mot de passe est exactement le genre de message qui fait croire à une perte.
 */
export function tonMnemonicNeedsPassword(mnemonic: string): boolean {
  const words = tonWords(mnemonic);
  if (words.length === 0) return false;
  const passless = mnemonicToEntropy(words, '');
  return isPasswordSeed(passless) && !isBasicSeed(passless);
}

/**
 * La phrase est-elle une phrase TON valide ?
 *
 * Reproduit `mnemonicValidate` de `@ton/crypto` — ce que Tonkeeper appelle
 * pour décider quelle dérivation appliquer. Donc : tous les mots dans la liste,
 * PAS de contrôle de longueur, et avec un mot de passe, la phrase doit en exiger un.
 */
export function isValidTonMnemonic(mnemonic: string, password = ''): boolean {
  const words = tonWords(mnemonic);
  if (words.length === 0 || !words.every((w) => WORDS.has(w))) return false;
  if (password.length > 0 && !tonMnemonicNeedsPassword(mnemonic)) return false;
  return isBasicSeed(mnemonicToEntropy(words, password));
}

/**
 * Graine ed25519 de 32 octets pour cette phrase.
 *
 * Ne valide PAS la phrase : la validation est un choix d'écran — on peut vouloir
 * dériver une phrase importée qui ne passe pas le contrôle TON, plutôt que de la
 * refuser et laisser l'utilisateur sans accès. L'appelant tranche.
 */
export function tonSeedFromMnemonic(mnemonic: string, password = ''): Uint8Array {
  const words = tonWords(mnemonic);
  if (words.length === 0) throw new Error('Phrase TON vide');
  const entropy = mnemonicToEntropy(words, password);
  const seed = pbkdf2(sha512, entropy, utf8ToBytes(SALT_KEYSTORE), { c: ITERATIONS, dkLen: 64 });
  // Les 32 PREMIERS octets, et seulement eux : les 32 suivants ne servent pas.
  return seed.slice(0, 32);
}
