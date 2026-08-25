const { base64 } = require('@scure/base');
const { secp256k1 } = require('@noble/curves/secp256k1');
const { sha256 } = require('@noble/hashes/sha256');

// Simulate a private key (32 bytes)
const privKey = new Uint8Array(32).fill(1);
const msgBytes = Buffer.from('test', 'utf8');
const MAGIC = Buffer.from('\x18Bitcoin Signed Message:\n', 'utf8');

const msgLenBytes = new Uint8Array([msgBytes.length]);
const payload = Buffer.concat([MAGIC, msgLenBytes, msgBytes]);
const hash = sha256(sha256(payload));

const sig = secp256k1.sign(hash, privKey);

console.log("Sig recovery:", sig.recovery);
console.log("Raw bytes length:", sig.toCompactRawBytes().length);

// 39 is for P2WPKH, let's see header
const header = 39 + sig.recovery;
const sigBytes = new Uint8Array(65);
sigBytes[0] = header;
sigBytes.set(sig.toCompactRawBytes(), 1);

console.log("Header:", header);
console.log("Total bytes:", sigBytes.length);
console.log("Base64:", base64.encode(sigBytes));
