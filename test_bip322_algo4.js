import * as btc from '@scure/btc-signer';
import { sha256 } from '@noble/hashes/sha256';
import { utf8ToBytes, concatBytes } from '@noble/hashes/utils';
import { base64, hex } from '@scure/base';
import { secp256k1 } from '@noble/curves/secp256k1';

const TAG = utf8ToBytes('BIP0322-signed-message');
const tagHash = sha256(TAG);
const message = utf8ToBytes('Hello World');
const messageHash = sha256(concatBytes(tagHash, tagHash, message));

const privKey = secp256k1.utils.randomPrivateKey();
const pubKey = secp256k1.getPublicKey(privKey, true);
const p2wpkh = btc.p2wpkh(pubKey);
const message_script = p2wpkh.script;

const toSpendTx = new btc.Transaction({ allowUnknownOutputs: true });
toSpendTx.addOutput({
  script: message_script,
  amount: 0n,
});
toSpendTx.addInput({
  txid: new Uint8Array(32),
  index: 0xffffffff,
  sequence: 0,
});
toSpendTx.updateInput(0, {
  finalScriptSig: btc.Script.encode([btc.OP.OP_0, messageHash]),
});
// Need to force version 0
// Actually btc-signer sets version = 2 by default.
// BIP322 says version 0. Does scure allow setting version?
// If we pass `{ version: 0 }` it should work? We'll see.
const toSpendTxId = toSpendTx.id;

const toSignTx = new btc.Transaction({ allowUnknownOutputs: true });
toSignTx.addOutput({
  script: btc.Script.encode([btc.OP.RETURN]),
  amount: 0n,
});
toSignTx.addInput({
  txid: hex.decode(toSpendTxId),
  index: 0,
  sequence: 0,
  witnessUtxo: { script: message_script, amount: 0n }
});
toSignTx.signIdx(privKey, 0);
toSignTx.finalize();

const witnessBytes = btc.RawWitness.encode(toSignTx.getInput(0).finalScriptWitness);
console.log("BASE64 SIG:", base64.encode(witnessBytes));
