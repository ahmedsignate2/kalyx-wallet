with open('lib/walletconnect.ts', 'r') as f:
    content = f.read()

import_replacement = """import { type RawTxRequest, useWallet, type WcSession } from './walletStore';
import { evmChains } from '../src/domain/chains/networks';
import { getAdapter } from '../src';"""

if "import { getAdapter } from '../src';" not in content:
    content = content.replace("import { evmChains } from '../src/domain/chains/networks';", import_replacement)

# Fix approveRequest logic
old_logic = """      } else if (method === 'solana_signTransaction') {
        const txStr = typeof p === 'string' ? p : (p.transaction || p[0]);
        result = await w.signSolanaTransaction(unlock, txStr);
      } else if (method === 'solana_signAllTransactions') {
        const txStrArray = p.transactions || p;
        result = await w.signSolanaTransactions(unlock, txStrArray);
      } else if (method === 'solana_signMessage') {
        const msg = typeof p === 'string' ? p : (p.message || p[0]);
        result = await w.signSolanaMessage(unlock, msg);
      } else if (method === 'bitcoin_signMessage') {
        const msg = p.message || p[0];
        result = await w.signBitcoinMessage(unlock, msg);
      } else if (method === 'bitcoin_signPsbt') {
        const psbt = p.psbt || p[0];
        result = await w.signBitcoinPsbt(unlock, psbt, { finalize: p.finalize, signInputs: p.signInputs });
      } else {
        throw new Error(`Méthode non supportée : ${method}`);
      }"""

new_logic = """      } else if (method === 'solana_signTransaction') {
        const txStr = typeof p === 'string' ? p : (p.transaction || p[0]);
        const res = await w.signSolanaTransaction(unlock, txStr);
        // Force strict string result format for Solana transactions
        result = typeof res === 'object' && (res as any).signature ? (res as any).signature : res;
      } else if (method === 'solana_signAllTransactions') {
        const txStrArray = p.transactions || p;
        const res = await w.signSolanaTransactions(unlock, txStrArray);
        result = Array.isArray(res) ? res.map(r => (typeof r === 'object' && (r as any).signature ? (r as any).signature : r)) : res;
      } else if (method === 'solana_signMessage') {
        const msg = typeof p === 'string' ? p : (p.message || p[0]);
        const res = await w.signSolanaMessage(unlock, msg);
        // Messages are usually okay as objects or strings depending on dApp, but Phantom expects { signature }
        result = res;
      } else if (method === 'bitcoin_signMessage' || method === 'signMessage') {
        const msg = typeof p === 'string' ? p : (p.message || p[0]);
        const sig = await w.signBitcoinMessage(unlock, msg);
        result = { signature: sig };
      } else if (method === 'bitcoin_signPsbt') {
        const psbt = p.psbt || p[0];
        result = await w.signBitcoinPsbt(unlock, psbt, { finalize: p.finalize, signInputs: p.signInputs });
      } else if (method === 'bitcoin_getAccounts' || method === 'getAccountAddresses') {
        // Return active BTC address and pubkey (derive it temporarily using unlock)
        const activeBtcAddress = w.account?.btcAddress || '';
        // In Nova, the BTC address and index are known. We'll use the existing btcAddress.
        // We can just query deriveBtcAccount from crypto/btc if we need the pubkey!
        const btcModule = await import('../src/crypto/btc');
        const hdModule = await import('../src/crypto/hd');
        const activeWallet = w.wallets.find(x => x.id === w.activeWalletId);
        if (!activeWallet || activeWallet.type === 'privateKey') throw new Error('Bitcoin accounts not available for PK wallet');
        const secret = hdModule.mnemonicToSeedSync(await w.revealPhrase(unlock));
        const derived = btcModule.deriveBtcAccount(secret, w.account?.index || 0);
        result = [{ address: activeBtcAddress, publicKey: derived.publicKey, purpose: 'payment' }];
      } else if (method === 'bitcoin_sendTransaction' || method === 'sendTransfer') {
        // Build, sign, broadcast and return txid
        const to = p.recipient || p.to || p[0]?.recipient;
        const amountStr = String(p.amount || p[0]?.amount || 0);
        const adapter = getAdapter('bitcoin');
        
        const btcModule = await import('../src/crypto/btc');
        const hdModule = await import('../src/crypto/hd');
        const secret = hdModule.mnemonicToSeedSync(await w.revealPhrase(unlock));
        const btcSigner = btcModule.deriveBtcSigner(secret, w.account?.index || 0);
        
        const txid = await (adapter as any).sendBitcoin(w.account?.btcAddress, to, amountStr, {
          privateKey: btcSigner.privateKey,
          publicKey: btcSigner.publicKey,
        });
        result = { txid };
      } else {
        throw new Error(`Méthode non supportée : ${method}`);
      }"""

content = content.replace(old_logic, new_logic)
with open('lib/walletconnect.ts', 'w') as f:
    f.write(content)
