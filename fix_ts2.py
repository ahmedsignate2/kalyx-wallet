with open('lib/walletconnect.ts', 'r') as f:
    content = f.read()

old_block = """      } else if (method === 'bitcoin_getAccounts' || method === 'getAccountAddresses') {
        // Return active BTC address and pubkey (derive it temporarily using unlock)
        const activeBtcAddress = derived.address;
        // In Nova, the BTC address and index are known. We'll use the existing btcAddress.
        // We can just query deriveBtcAccount from crypto/btc if we need the pubkey!
        const btcModule = await import('../src/crypto/btc');
        const mnemonicModule = await import('../src/crypto/mnemonic');
        const activeWallet = w.wallets.find(x => x.id === w.activeWalletId);
        if (!activeWallet || activeWallet.type === 'privateKey') throw new Error('Bitcoin accounts not available for PK wallet');
        const secret = mnemonicModule.mnemonicToSeedSync(await w.revealPhrase(unlock));
        const derived = btcModule.deriveBtcAccount(secret, w.account?.index || 0);
        result = [{ address: activeBtcAddress, publicKey: derived.publicKey, purpose: 'payment' }];"""

new_block = """      } else if (method === 'bitcoin_getAccounts' || method === 'getAccountAddresses') {
        const btcModule = await import('../src/crypto/btc');
        const mnemonicModule = await import('../src/crypto/mnemonic');
        const activeWallet = w.wallets.find(x => x.id === w.activeWalletId);
        if (!activeWallet || activeWallet.type === 'privateKey') throw new Error('Bitcoin accounts not available for PK wallet');
        const secret = mnemonicModule.mnemonicToSeedSync(await w.revealPhrase(unlock));
        const derived = btcModule.deriveBtcAccount(secret, w.account?.index || 0);
        result = [{ address: derived.address, publicKey: derived.publicKey, purpose: 'payment' }];"""

content = content.replace(old_block, new_block)
with open('lib/walletconnect.ts', 'w') as f:
    f.write(content)
