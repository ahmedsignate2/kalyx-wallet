const fs = require('fs');

let wcContent = fs.readFileSync('lib/walletconnect.ts', 'utf8');
wcContent = wcContent.replace(
  "result = { signature: sig };\n      } else if (method === 'bitcoin_signPsbt'",
  "result = sig;\n      } else if (method === 'bitcoin_signPsbt'"
);
fs.writeFileSync('lib/walletconnect.ts', wcContent);

let storeContent = fs.readFileSync('lib/walletStore.ts', 'utf8');
// Also restore header to 39 for SegWit Native (bc1q) since we use P2WPKH
storeContent = storeContent.replace('const header = 31 + sig.recovery;', 'const header = 39 + sig.recovery;');
fs.writeFileSync('lib/walletStore.ts', storeContent);
