/**
 * SLIP-0010 pour ed25519 : d'une graine BIP-39 à une clé, le long d'un chemin.
 *
 * Partagé par Solana (`m/44'/501'/i'/0'`) et TON (`m/44'/607'/0'`). Une seule
 * implémentation pour les deux : si elles divergeaient un jour, l'une des deux
 * chaînes afficherait des adresses que personne d'autre ne reconnaît.
 *
 * Particularités d'ed25519 par rapport à BIP-32 : seuls les index DURCIS
 * existent, la clé maîtresse est `HMAC-SHA512(clé = "ed25519 seed", graine)`, et
 * un enfant est `HMAC-SHA512(chainCode, 0x00 ‖ clé ‖ ser32(index + 2³¹))`.
 * `@scure/bip32` ne gère que secp256k1, d'où cette implémentation.
 */
import { hmac } from '@noble/hashes/hmac';
import { sha512 } from '@noble/hashes/sha512';
import { utf8ToBytes } from '@noble/hashes/utils';

const HARDENED = 0x80000000;
const ED25519_SEED = utf8ToBytes('ed25519 seed');

function ser32(value: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, value >>> 0, false); // big-endian
  return b;
}

/**
 * Dérive (clé privée, chain code) le long des segments, exprimés SANS le
 * décalage durci : `[44, 501, 0, 0]` pour `m/44'/501'/0'/0'`.
 */
export function deriveEd25519(seed: Uint8Array, segments: number[]): { key: Uint8Array; chainCode: Uint8Array } {
  // Chaque tampon intermédiaire (clés parentes, sorties HMAC) est remis à zéro dès qu'il ne sert plus :
  // seul le résultat final reste en mémoire.
  const I = hmac(sha512, ED25519_SEED, seed);
  let key = I.slice(0, 32);
  let chainCode = I.slice(32);
  I.fill(0);
  try {
    for (const seg of segments) {
      if (!Number.isInteger(seg) || seg < 0 || seg >= HARDENED) throw new Error('SLIP-0010 : segment de chemin invalide');
      const data = new Uint8Array(37); // 0x00 || key(32) || ser32(index)
      data[0] = 0x00;
      data.set(key, 1);
      data.set(ser32(seg + HARDENED), 33);
      const In = hmac(sha512, chainCode, data);
      data.fill(0);
      key.fill(0);
      chainCode.fill(0);
      key = In.slice(0, 32);
      chainCode = In.slice(32);
      In.fill(0);
    }
  } catch (e) {
    key.fill(0);
    chainCode.fill(0);
    throw e;
  }
  return { key, chainCode };
}
