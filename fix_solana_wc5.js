const fs = require('fs');
let content = fs.readFileSync('lib/walletconnect.ts', 'utf8');

const helper = `
import { VersionedTransaction } from '@solana/web3.js';
function extractSolanaSignature(tx: string, address: string): string {
  try {
    const isBase64 = /^[a-zA-Z0-9+/]*={0,2}$/.test(tx) && tx.length % 4 === 0;
    const bytes = isBase64 ? base64.decode(tx) : base58.decode(tx);
    const vtx = VersionedTransaction.deserialize(bytes);
    const idx = vtx.message.staticAccountKeys.findIndex(k => k.toBase58() === address);
    if (idx >= 0 && vtx.signatures[idx]) {
      return base58.encode(vtx.signatures[idx]);
    }
    return base58.encode(vtx.signatures[0]);
  } catch {
    return tx;
  }
}
`;

content = content.replace("function ensureBase58(tx: string): string {", helper + "\nfunction ensureBase58(tx: string): string {");

// Now update the result generation:
// For solana_signTransaction, res is the full signed tx.
// We need to pass w.account.address to extractSolanaSignature.
// But wait, in the walletconnect handler, we don't have w.account extracted directly. We can get it from get().wallet.accounts[get().wallet.activeAccountIndex]?.solAddress
content = content.replace(
  'result = { signature: ensureBase58(res), transaction: ensureBase58(res) };',
  'const solAddr = get().wallet.accounts[get().wallet.activeAccountIndex]?.solAddress;\n        result = { signature: extractSolanaSignature(res, solAddr || ""), transaction: ensureBase58(res) };'
);

content = content.replace(
  'result = { signatures: res.map(ensureBase58), transactions: res.map(ensureBase58) };',
  'const solAddr = get().wallet.accounts[get().wallet.activeAccountIndex]?.solAddress;\n        result = { signatures: res.map(r => extractSolanaSignature(r, solAddr || "")), transactions: res.map(ensureBase58) };'
);

fs.writeFileSync('lib/walletconnect.ts', content);
