const fs = require('fs');

let code = fs.readFileSync('app/earn.tsx', 'utf8');

const regexExec = /let hash = '';\s*if \(isEvm && \(quote\.tx as any\)\.type === 'evm'\) \{\s*hash = await sendRawTxOn\(unlock, chainId, quote\.tx as any\);\s*\} else if \(\!isEvm && \(quote\.tx as any\)\.type === 'solana'\) \{\s*hash = await walletStore\.signSolanaTransaction\(unlock, \(quote\.tx as any\)\.data\);\s*\}/m;

const replacementExec = `let hash = '';
      if (isEvm && (quote.tx as any).type === 'evm') {
        hash = await sendRawTxOn(unlock, chainId, quote.tx as any);
        try { await (adapter as EvmChainAdapter).waitForTx(hash); } catch(e) {}
      } else if (!isEvm && (quote.tx as any).type === 'solana') {
        const signedTxStr = await walletStore.signSolanaTransaction(unlock, (quote.tx as any).data);
        const solAdapter = getAdapter('solana') as SolanaChainAdapter;
        hash = await (solAdapter as any).rpc('sendTransaction', [signedTxStr, { encoding: 'base64' }]);
        if (!hash) throw new Error('Transaction refusée');
        await new Promise(r => setTimeout(r, 2000)); // wait for solana propagation
      }`;

code = code.replace(regexExec, replacementExec);
fs.writeFileSync('app/earn.tsx', code);
