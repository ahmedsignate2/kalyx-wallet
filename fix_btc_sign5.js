const fs = require('fs');

let wcContent = fs.readFileSync('lib/walletconnect.ts', 'utf8');

// Replace object wrapper with direct string
wcContent = wcContent.replace(
  "const sig = await w.signBitcoinMessage(unlock, msg, type as 'ecdsa'|'bip322');\n        result = { signature: sig };",
  "const sig = await w.signBitcoinMessage(unlock, msg, type as 'ecdsa'|'bip322');\n        result = sig;"
);

fs.writeFileSync('lib/walletconnect.ts', wcContent);
