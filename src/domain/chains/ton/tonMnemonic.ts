/**
 * TON — de la phrase de récupération à la clé, dérivation NATIVE.
 *
 * ## Pourquoi cette dérivation et pas SLIP-0010
 *
 * TON utilise ed25519 comme Solana, mais il existe DEUX façons incompatibles de
 * passer d'une phrase à une clé, et elles donnent des adresses différentes pour
 * la même phrase. La dérivation native (celle d'ici) est ce qu'utilisent
 * Tonkeeper, TonHub et le portefeuille officiel ; SLIP-0010 sur `m/44'/607'` est
 * ce qu'utilise Ledger.
 *
 * Le choix est tranché en faveur de la native, pour une raison qui n'est pas
 * d'architecture : un utilisateur qui importe sa phrase Tonkeeper doit voir ses
 * fonds. Avec SLIP-0010 il verrait un compte vide et en conclurait, à raison, que
 * le portefeuille est cassé.
 *
 * Conséquence assumée : cette dérivation part de la PHRASE, pas de la graine
 * BIP-39 que Kalyx calcule déjà. C'est la seule chaîne dans ce cas, et cela
 * remonte jusqu'à `deriveSigner`. Voir `docs/10-TON.md` §1.
 *
 * ## L'algorithme, écrit noir sur blanc
 *
 * Il est reproduit ici en détail parce qu'il n'a rien d'intuitif et que chaque
 * constante compte — un sel ou un nombre d'itérations erroné produit une clé
 * valide pour une adresse qui n'est pas celle de l'utilisateur :
 *
 * 1. `entropie = HMAC-SHA512(clé = mots joints par une espace, données = mot de passe)`
 *    — noter l'inversion : la phrase est la CLÉ du HMAC, pas les données.
 * 2. `graine = PBKDF2-SHA512(entropie, sel = "TON default seed", 100 000 itérations, 64 octets)`
 * 3. La clé ed25519 est constituée des **32 premiers octets** de cette graine.
 *
 * La validité d'une phrase TON n'est PAS celle de BIP-39 : il n'y a pas de somme
 * de contrôle sur les mots. Une phrase est valide si
 * `PBKDF2-SHA512(entropie, "TON seed version", 100000/256)` commence par un octet
 * nul — ce qui explique pourquoi les générateurs TON tirent des phrases en boucle
 * jusqu'à tomber sur une qui passe.
 *
 * ## Ce qui reste à confirmer avant d'activer TON
 *
 * Cette implémentation suit l'algorithme de `ton-crypto`, mais elle n'est PAS
 * validée contre un vecteur réel : les tests vérifient le déterminisme, les
 * longueurs et la cohérence interne, pas l'interopérabilité. Avant d'exposer TON
 * dans l'app, il faut comparer une adresse dérivée ici à celle que Tonkeeper
 * affiche pour la même phrase. Une dérivation fausse ne plante pas — elle montre
 * un portefeuille vide, ce qui est le pire des deux.
 */
import { hmac } from '@noble/hashes/hmac';
import { sha512 } from '@noble/hashes/sha2';
import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { utf8ToBytes } from '@noble/hashes/utils';

/** Sel de la dérivation de clé. */
const SALT_KEYSTORE = 'TON default seed';
/** Sel du contrôle de validité d'une phrase. */
const SALT_SEED_VERSION = 'TON seed version';
/** Sel du contrôle « cette phrase attend-elle un mot de passe ? ». */
const SALT_PASSWORD_VERSION = 'TON fast seed version';
/** Itérations de la dérivation. Fixé par TON, pas un réglage. */
const ITERATIONS = 100_000;

/** Nombre de mots d'une phrase TON. */
export const TON_MNEMONIC_WORDS = 24;

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

/**
 * La phrase est-elle une phrase TON valide ?
 *
 * Aucun rapport avec BIP-39 : pas de somme de contrôle sur les mots, mais un
 * contrôle sur l'entropie dérivée. Le nombre d'itérations est
 * `max(1, 100000/256)` — une division venue de la spécification, pas une
 * approximation de notre part.
 */
export function isValidTonMnemonic(mnemonic: string, password = ''): boolean {
  const words = tonWords(mnemonic);
  if (words.length !== TON_MNEMONIC_WORDS) return false;
  const entropy = mnemonicToEntropy(words, password);
  const check = pbkdf2(sha512, entropy, utf8ToBytes(SALT_SEED_VERSION), {
    c: Math.max(1, Math.floor(ITERATIONS / 256)),
    dkLen: 64,
  });
  return check[0] === 0;
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
  if (words.length !== TON_MNEMONIC_WORDS) return false;
  const entropy = mnemonicToEntropy(words, '');
  const fast = pbkdf2(sha512, entropy, utf8ToBytes(SALT_PASSWORD_VERSION), { c: 1, dkLen: 64 });
  // Marqueur « mot de passe » posé, et la phrase n'est pas valide telle quelle.
  return fast[0] === 1 && !isValidTonMnemonic(mnemonic, '');
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
