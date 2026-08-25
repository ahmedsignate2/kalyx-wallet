const { secp256k1 } = require('@noble/curves/secp256k1');
const { sha256 } = require('@noble/hashes/sha256');

const privKey = new Uint8Array(32).fill(1);
const hash = sha256(new Uint8Array([1, 2, 3]));
const sig = secp256k1.sign(hash, privKey);

console.log(sig.toCompactRawBytes().length);
