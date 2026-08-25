import re

with open('lib/walletStore.ts', 'r') as f:
    content = f.read()

# Import VersionedTransaction and Keypair
if "import { VersionedTransaction, Keypair } from '@solana/web3.js';" not in content:
    content = content.replace("import { authenticate } from './biometrics';", "import { authenticate } from './biometrics';\nimport { VersionedTransaction, Keypair } from '@solana/web3.js';")

# Replace signSolanaTransaction
solana_tx_pattern = r'signSolanaTransaction:\s*async\s*\(unlock,\s*txStr\)\s*=>\s*\{.*?(?=signSolanaTransactions:)'
solana_tx_replacement = """signSolanaTransaction: async (unlock, txStr) => {
    const { account, activeWalletId } = get();
    if (!account) throw new Error('Aucun compte');
    const secret = await revealMnemonic(activeWalletId, unlock);
    const signer = deriveSolanaSigner(mnemonicToSeedSync(secret), account.index);

    const isBase64 = /^[a-zA-Z0-9+/]*={0,2}$/.test(txStr) && txStr.length % 4 === 0;
    const bytes = isBase64 ? base64.decode(txStr) : base58.decode(txStr);

    const tx = VersionedTransaction.deserialize(bytes);
    const keypair = Keypair.fromSecretKey(signer.secretKey);
    tx.sign([keypair]);

    const serialized = tx.serialize();
    return isBase64 ? base64.encode(serialized) : base58.encode(serialized);
  },

  """
content = re.sub(solana_tx_pattern, solana_tx_replacement, content, flags=re.DOTALL)

with open('lib/walletStore.ts', 'w') as f:
    f.write(content)
