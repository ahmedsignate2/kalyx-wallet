const fs = require('fs');
let content = fs.readFileSync('lib/walletconnect.ts', 'utf8');

// Add bs58 and base64 imports if missing, but we can just use the ones from walletStore or @scure/base
if (!content.includes("import { base58, base64 } from '@scure/base';") && !content.includes("from '@scure/base'")) {
  content = `import { base58, base64 } from '@scure/base';\n` + content;
} else if (!content.includes('base58') && content.includes('@scure/base')) {
    content = content.replace(/import \{([^}]+)\} from '@scure\/base';/, "import { base58, base64, $1 } from '@scure/base';");
}

// Ensure base58 format helper
const helper = `
function ensureBase58(tx: string): string {
  const isBase64 = /^[a-zA-Z0-9+/]*={0,2}$/.test(tx) && tx.length % 4 === 0;
  if (!isBase64) return tx; // already base58
  try {
    return base58.encode(base64.decode(tx));
  } catch {
    return tx;
  }
}
`;

if (!content.includes('ensureBase58')) {
    content = content.replace("export const METHOD_LABELS", helper + "\nexport const METHOD_LABELS");
}

content = content.replace('result = { signature: res, transaction: res };', 'result = { signature: ensureBase58(res), transaction: ensureBase58(res) };');
content = content.replace('result = { signatures: res, transactions: res };', 'result = { signatures: res.map(ensureBase58), transactions: res.map(ensureBase58) };');

fs.writeFileSync('lib/walletconnect.ts', content);
