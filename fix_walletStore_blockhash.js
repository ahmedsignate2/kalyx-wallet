const fs = require('fs');

let code = fs.readFileSync('lib/walletStore.ts', 'utf8');

const regexType = /signSolanaTransaction: \(unlock: Unlock, txStr: string\) => Promise<string>;/g;
code = code.replace(regexType, "signSolanaTransaction: (unlock: Unlock, txStr: string, refreshBlockhash?: boolean) => Promise<string>;");

const regexImpl = /signSolanaTransaction: async \(unlock, txStr\) => \{\s*const \{ account, activeWalletId \} = get\(\);\s*if \(\!account\) throw new Error\('Aucun compte'\);\s*const secret = await revealMnemonic\(activeWalletId, unlock\);\s*const signer = deriveSolanaSigner\(mnemonicToSeedSync\(secret\), account\.index\);\s*const isBase64 = \/\^\[a-zA-Z0-9\+\/\]\*=\{0,2\}\$\/\.test\(txStr\) && txStr\.length % 4 === 0;\s*const bytes = isBase64 \? base64\.decode\(txStr\) : base58\.decode\(txStr\);\s*const tx = VersionedTransaction\.deserialize\(bytes\);\s*const keypair = Keypair\.fromSeed\(signer\.secretKey\);/m;

const replacementImpl = `signSolanaTransaction: async (unlock, txStr, refreshBlockhash = false) => {
    const { account, activeWalletId } = get();
    if (!account) throw new Error('Aucun compte');
    const secret = await revealMnemonic(activeWalletId, unlock);
    const signer = deriveSolanaSigner(mnemonicToSeedSync(secret), account.index);

    const isBase64 = /^[a-zA-Z0-9+/]*={0,2}$/.test(txStr) && txStr.length % 4 === 0;
    const bytes = isBase64 ? base64.decode(txStr) : base58.decode(txStr);

    const tx = VersionedTransaction.deserialize(bytes);
    
    if (refreshBlockhash) {
      try {
        const adapter = getAdapter('solana') as SolanaChainAdapter;
        const res = await (adapter as any).rpc('getLatestBlockhash', [{ commitment: 'finalized' }]);
        if (res?.value?.blockhash) {
          tx.message.recentBlockhash = res.value.blockhash;
        }
      } catch (e) {
        console.warn('Failed to refresh blockhash', e);
      }
    }

    const keypair = Keypair.fromSeed(signer.secretKey);`;

code = code.replace(regexImpl, replacementImpl);
fs.writeFileSync('lib/walletStore.ts', code);
