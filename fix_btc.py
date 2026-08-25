import re

with open('lib/walletStore.ts', 'r') as f:
    content = f.read()

content = content.replace("signBitcoinMessage: (unlock: Unlock, message: string) => Promise<string>;", "signBitcoinMessage: (unlock: Unlock, message: string, type?: 'ecdsa' | 'bip322') => Promise<string>;")

old_impl = """  signBitcoinMessage: async (unlock, message) => {
    const { account, activeWalletId } = get();
    if (!account) throw new Error('Aucun compte');
    const secret = await revealMnemonic(activeWalletId, unlock);
    const signer = deriveBtcSigner(mnemonicToSeedSync(secret), account.index);

    const TAG = utf8ToBytes('BIP0322-signed-message');
    const tagHash = sha256(TAG);
    
    let msgBytes: Uint8Array;
    if (/^[0-9a-fA-F]+$/.test(message) && message.length % 2 === 0) {
      msgBytes = hex.decode(message);
    } else {
      try {
        msgBytes = base64.decode(message);
      } catch {
        msgBytes = utf8ToBytes(message);
      }
    }

    const messageHash = sha256(concatBytes(tagHash, tagHash, msgBytes));
    const p2wpkh = btcLib.p2wpkh(signer.publicKey);
    const message_script = p2wpkh.script;

    const toSpendTx = new btcLib.Transaction({ version: 0, allowUnknownOutputs: true });
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
      finalScriptSig: btcLib.Script.encode([btcLib.OP.OP_0, messageHash]),
    });

    const toSignTx = new btcLib.Transaction({ version: 0, allowUnknownOutputs: true });
    toSignTx.addOutput({
      script: btcLib.Script.encode([btcLib.OP.RETURN]),
      amount: 0n,
    });
    toSignTx.addInput({
      txid: hex.decode(toSpendTx.id),
      index: 0,
      sequence: 0,
      witnessUtxo: { script: message_script, amount: 0n }
    });

    toSignTx.signIdx(signer.privateKey, 0);
    toSignTx.finalize();

    const input = toSignTx.getInput(0);
    if (!input.finalScriptWitness) throw new Error('Signature failure');
    const witnessBytes = btcLib.RawWitness.encode(input.finalScriptWitness);
    return base64.encode(witnessBytes);
  },"""

new_impl = """  signBitcoinMessage: async (unlock, message, type = 'ecdsa') => {
    const { account, activeWalletId } = get();
    if (!account) throw new Error('Aucun compte');
    const secret = await revealMnemonic(activeWalletId, unlock);
    const signer = deriveBtcSigner(mnemonicToSeedSync(secret), account.index);

    let msgBytes: Uint8Array;
    if (/^[0-9a-fA-F]+$/.test(message) && message.length % 2 === 0) {
      msgBytes = hex.decode(message);
    } else {
      try {
        msgBytes = base64.decode(message);
      } catch {
        msgBytes = utf8ToBytes(message);
      }
    }

    if (type === 'ecdsa') {
      const MAGIC = utf8ToBytes('\\x18Bitcoin Signed Message:\\n');
      let msgLenBytes: Uint8Array;
      if (msgBytes.length < 253) {
        msgLenBytes = new Uint8Array([msgBytes.length]);
      } else if (msgBytes.length <= 0xffff) {
        msgLenBytes = new Uint8Array(3);
        msgLenBytes[0] = 253;
        new DataView(msgLenBytes.buffer).setUint16(1, msgBytes.length, true);
      } else if (msgBytes.length <= 0xffffffff) {
        msgLenBytes = new Uint8Array(5);
        msgLenBytes[0] = 254;
        new DataView(msgLenBytes.buffer).setUint32(1, msgBytes.length, true);
      } else {
        throw new Error('Message too long');
      }

      const payload = concatBytes(MAGIC, msgLenBytes, msgBytes);
      const hash = sha256(sha256(payload));

      const sig = secp256k1.sign(hash, signer.privateKey);
      const header = 39 + sig.recovery;
      const sigBytes = new Uint8Array(65);
      sigBytes[0] = header;
      sigBytes.set(sig.toCompactRawBytes(), 1);

      return base64.encode(sigBytes);
    } else {
      const TAG = utf8ToBytes('BIP0322-signed-message');
      const tagHash = sha256(TAG);
      
      const messageHash = sha256(concatBytes(tagHash, tagHash, msgBytes));
      const p2wpkh = btcLib.p2wpkh(signer.publicKey);
      const message_script = p2wpkh.script;

      const toSpendTx = new btcLib.Transaction({ version: 0, allowUnknownOutputs: true });
      toSpendTx.addOutput({ script: message_script, amount: 0n });
      toSpendTx.addInput({ txid: new Uint8Array(32), index: 0xffffffff, sequence: 0 });
      toSpendTx.updateInput(0, { finalScriptSig: btcLib.Script.encode([btcLib.OP.OP_0, messageHash]) });

      const toSignTx = new btcLib.Transaction({ version: 0, allowUnknownOutputs: true });
      toSignTx.addOutput({ script: btcLib.Script.encode([btcLib.OP.RETURN]), amount: 0n });
      toSignTx.addInput({ txid: hex.decode(toSpendTx.id), index: 0, sequence: 0, witnessUtxo: { script: message_script, amount: 0n } });

      toSignTx.signIdx(signer.privateKey, 0);
      toSignTx.finalize();

      const input = toSignTx.getInput(0);
      if (!input.finalScriptWitness) throw new Error('Signature failure');
      const witnessBytes = btcLib.RawWitness.encode(input.finalScriptWitness);
      return base64.encode(witnessBytes);
    }
  },"""

content = content.replace(old_impl, new_impl)

with open('lib/walletStore.ts', 'w') as f:
    f.write(content)
