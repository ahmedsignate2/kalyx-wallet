const fs = require('fs');

let wcContent = fs.readFileSync('lib/walletconnect.ts', 'utf8');

// Replace direct string with object wrapper
wcContent = wcContent.replace(
  "const sig = await w.signBitcoinMessage(unlock, msg, type as 'ecdsa'|'bip322');\n        result = sig;",
  "const sig = await w.signBitcoinMessage(unlock, msg, type as 'ecdsa'|'bip322');\n        result = { signature: sig };"
);

fs.writeFileSync('lib/walletconnect.ts', wcContent);
