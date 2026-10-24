/*
 * TESTS seulement (vitest) : `@ton/core` fait `require('@ton/crypto')`, absent
 * du projet. Mêmes trois fonctions que src/crypto/tonCoreCrypto.ts (ce que le
 * build utilise, via l'alias de wxt.config.ts), en CommonJS pour Node.
 */
const { Buffer } = require('buffer');
const { sha256 } = require('@noble/hashes/sha256');
const { ed25519 } = require('@noble/curves/ed25519');

const bytes = (src) => (typeof src === 'string' ? Buffer.from(src, 'utf8') : src);
exports.sha256_sync = (source) => Buffer.from(sha256(bytes(source)));
exports.sign = (data, secretKey) => {
  if (secretKey.length !== 64 && secretKey.length !== 32) throw new Error('Clé secrète ed25519 invalide');
  return Buffer.from(ed25519.sign(data, secretKey.subarray(0, 32)));
};
exports.signVerify = (data, signature, publicKey) => {
  try {
    return ed25519.verify(signature, data, publicKey);
  } catch {
    return false;
  }
};
