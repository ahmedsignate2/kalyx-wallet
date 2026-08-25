const { secp256k1 } = require('@noble/curves/secp256k1');
const sig = secp256k1.sign(new Uint8Array(32), new Uint8Array(32).fill(1));
console.log(typeof sig.recovery, sig.recovery);
