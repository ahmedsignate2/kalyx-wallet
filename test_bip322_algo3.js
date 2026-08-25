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

const toSpendTx = new btc.Transaction({ version: 0, lockTime: 0, allowUnknownOutputs: true });
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
  finalScriptSig: btc.Script.encode([0, messageHash]),
});

const toSpendTxId = toSpendTx.id;

const toSignTx = new btc.Transaction({ version: 0, lockTime: 0, allowUnknownOutputs: true });
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

const sigHash = toSignTx.hashForWitnessV0(0, message_script, 0n, btc.SigHash.ALL);
const sig = secp256k1.sign(sigHash, privKey);
const finalSig = btc.utils.concatBytes(sig.toDERRawBytes(), new Uint8Array([btc.SigHash.ALL]));

toSignTx.updateInput(0, {
  finalScriptWitness: [finalSig, pubKey]
});

const witnessBytes = btc.RawWitness.encode([finalSig, pubKey]);
console.log("BASE64 SIG:", base64.encode(witnessBytes));
