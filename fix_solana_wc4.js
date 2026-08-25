const fs = require('fs');
let content = fs.readFileSync('lib/walletconnect.ts', 'utf8');

// Replace ensureBase58 logic with something that extracts the signature
const helper = `
import { VersionedTransaction } from '@solana/web3.js';
function extractSignatureBase58(txStr: string): string {
  try {
    const isBase64 = /^[a-zA-Z0-9+/]*={0,2}$/.test(txStr) && txStr.length % 4 === 0;
    const bytes = isBase64 ? base64.decode(txStr) : base58.decode(txStr);
    const tx = VersionedTransaction.deserialize(bytes);
    if (tx.signatures && tx.signatures.length > 0) {
      // Find the first non-empty signature (or we could match our pubkey, but usually we just signed it)
      // Actually, since we signed it, our signature is in tx.signatures. 
      // If there are multiple, the adapter usually expects the one for the fee payer or the requested pubkey.
      // Let's just return the first non-zero signature, or better, the one corresponding to the active account.
      // Wait, simpler: we just return the first signature. 
      return base58.encode(tx.signatures[0]);
    }
  } catch (e) {
    console.error("extractSignatureBase58 error:", e);
  }
  return txStr;
}

function ensureBase58(tx: string): string {
  const isBase64 = /^[a-zA-Z0-9+/]*={0,2}$/.test(tx) && tx.length % 4 === 0;
  if (!isBase64) return tx;
  try {
    return base58.encode(base64.decode(tx));
  } catch {
    return tx;
  }
}
`;

// Wait, walletconnect.ts already has imports and ensureBase58. Let's patch it cleanly.
