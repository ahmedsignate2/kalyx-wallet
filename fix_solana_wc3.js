const fs = require('fs');
let content = fs.readFileSync('lib/walletconnect.ts', 'utf8');

const helper = `
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

if (!content.includes('function ensureBase58')) {
  content = content.replace("const METHOD_LABELS: Record<string, string> =", helper + "\nconst METHOD_LABELS: Record<string, string> =");
}

fs.writeFileSync('lib/walletconnect.ts', content);
