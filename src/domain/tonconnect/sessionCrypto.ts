/**
 * TON Connect — chiffrement de session : `crypto_box` de NaCl (x25519 +
 * XSalsa20-Poly1305), reconstruit avec @noble.
 *
 * C'est exactement `SessionCrypto` de `@tonconnect/protocol` (relu dans son
 * code, v3.0.0) : clé x25519 de session, nonce aléatoire de 24 octets, message
 * transporté sous la forme `nonce || boîte`. Aucune dépendance native —
 * `tweetnacl` n'est utilisé qu'une fois, hors de l'app, pour produire les
 * vecteurs de test (`nacl-box-vectors.json`) : même entrée, mêmes octets.
 *
 * `crypto_box` = XSalsa20-Poly1305 avec la clé HSalsa20(x25519(sk, pk), 0¹⁶).
 */
import { x25519 } from '@noble/curves/ed25519';
import { hsalsa, xsalsa20poly1305 } from '@noble/ciphers/salsa';
import { randomBytes } from '@noble/hashes/utils';
import { hex } from '@scure/base';

const NONCE_LENGTH = 24;
// Constante « expand 32-byte k » de Salsa20, en mots de 32 bits little-endian.
const SIGMA = new Uint32Array([0x61707865, 0x3320646e, 0x79622d32, 0x6b206574]);

function u32(bytes: Uint8Array): Uint32Array {
  const out = new Uint32Array(bytes.length / 4);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < out.length; i++) out[i] = view.getUint32(i * 4, true);
  return out;
}

function bytes(words: Uint32Array): Uint8Array {
  const out = new Uint8Array(words.length * 4);
  const view = new DataView(out.buffer);
  for (let i = 0; i < words.length; i++) view.setUint32(i * 4, words[i], true);
  return out;
}

/** Clé de boîte partagée : `crypto_box_beforenm`. */
function boxKey(theirPublic: Uint8Array, mySecret: Uint8Array): Uint8Array {
  const shared = x25519.getSharedSecret(mySecret, theirPublic);
  const out = new Uint32Array(8);
  hsalsa(SIGMA, u32(shared), new Uint32Array(4), out);
  return bytes(out);
}

export interface SessionKeyPair {
  /** Hex, 32 octets — c'est aussi l'identifiant client sur le pont. */
  publicKey: string;
  secretKey: string;
}

export function newSessionKeyPair(): SessionKeyPair {
  const secret = randomBytes(32);
  return { publicKey: hex.encode(x25519.getPublicKey(secret)), secretKey: hex.encode(secret) };
}

/** Chiffre `message` pour `theirPublic` : `nonce || boîte`. */
export function encryptMessage(message: string, theirPublicHex: string, mySecretHex: string, nonce: Uint8Array = randomBytes(NONCE_LENGTH)): Uint8Array {
  if (nonce.length !== NONCE_LENGTH) throw new Error('Nonce de 24 octets attendu');
  const boxed = xsalsa20poly1305(boxKey(hex.decode(theirPublicHex), hex.decode(mySecretHex)), nonce).encrypt(new TextEncoder().encode(message));
  const out = new Uint8Array(NONCE_LENGTH + boxed.length);
  out.set(nonce, 0);
  out.set(boxed, NONCE_LENGTH);
  return out;
}

/** Ouvre `nonce || boîte` venu de `theirPublic`. Lève si la boîte est fausse ou altérée. */
export function decryptMessage(blob: Uint8Array, theirPublicHex: string, mySecretHex: string): string {
  if (blob.length < NONCE_LENGTH + 16) throw new Error('Message TON Connect tronqué');
  const nonce = blob.subarray(0, NONCE_LENGTH);
  const opened = xsalsa20poly1305(boxKey(hex.decode(theirPublicHex), hex.decode(mySecretHex)), nonce).decrypt(blob.subarray(NONCE_LENGTH));
  return new TextDecoder().decode(opened);
}
