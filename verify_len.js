const fs = require('fs');
let wcContent = fs.readFileSync('lib/walletconnect.ts', 'utf8');

// Insert a log right before result = { signature: sig }
wcContent = wcContent.replace(
  "const sig = await w.signBitcoinMessage(unlock, msg, type as 'ecdsa'|'bip322');\n        result = { signature: sig };",
  "const sig = await w.signBitcoinMessage(unlock, msg, type as 'ecdsa'|'bip322');\n        const decodedLen = require('buffer').Buffer.from(sig, 'base64').length;\n        console.log('\\n[DEBUG-VERIFY] Signature length in bytes:', decodedLen, '\\n');\n        result = { signature: sig };"
);

fs.writeFileSync('lib/walletconnect.ts', wcContent);
