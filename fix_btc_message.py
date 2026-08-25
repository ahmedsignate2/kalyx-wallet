import re

with open('lib/walletStore.ts', 'r') as f:
    content = f.read()

# Make sure btc and others are imported
if "import * as btc from '@scure/btc-signer';" not in content:
    content = content.replace("import { secp256k1 } from '@noble/curves/secp256k1';", "import { secp256k1 } from '@noble/curves/secp256k1';\nimport * as btc from '@scure/btc-signer';")

btc_msg_pattern = r'signBitcoinMessage:\s*async\s*\(unlock,\s*message\)\s*=>\s*\{.*?(?=\s*\},?\n\s*executeSwap:)'
btc_msg_replacement = """signBitcoinMessage: async (unlock, message) => {
    const { account, activeWalletId } = get();
    if (!account) throw new Error('Aucun compte');
    const secret = await revealMnemonic(activeWalletId, unlock);
    const signer = deriveBtcSigner(mnemonicToSeedSync(secret), account.index);

    const TAG = utf8ToBytes('BIP0322-signed-message');
    const tagHash = sha256(TAG);
    
    let msgBytes;
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
    const p2wpkh = btc.p2wpkh(signer.publicKey);
    const message_script = p2wpkh.script;

    const toSpendTx = new btc.Transaction({ version: 0, allowUnknownOutputs: true });
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

    const toSignTx = new btc.Transaction({ version: 0, allowUnknownOutputs: true });
    toSignTx.addOutput({
      script: btc.Script.encode([btc.OP.RETURN]),
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

    const witnessBytes = btc.RawWitness.encode(toSignTx.getInput(0).finalScriptWitness);
    return base64.encode(witnessBytes);
  """
content = re.sub(btc_msg_pattern, btc_msg_replacement, content, flags=re.DOTALL)

with open('lib/walletStore.ts', 'w') as f:
    f.write(content)
