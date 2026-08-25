const fs = require('fs');

let wcContent = fs.readFileSync('lib/walletconnect.ts', 'utf8');

// Replace the response to convert base64 to hex
wcContent = wcContent.replace(
  "const sig = await w.signBitcoinMessage(unlock, msg, type as 'ecdsa'|'bip322');\n        const decodedLen = require('buffer').Buffer.from(sig, 'base64').length;\n        console.log('\\n[DEBUG-VERIFY] Signature length in bytes:', decodedLen, '\\n');\n        result = { signature: sig };",
  "const sigBase64 = await w.signBitcoinMessage(unlock, msg, type as 'ecdsa'|'bip322');\n        const sigHex = require('buffer').Buffer.from(sigBase64, 'base64').toString('hex');\n        console.log('\\n[DEBUG-VERIFY] Sig hex length:', sigHex.length, '\\n');\n        result = { signature: sigHex };"
);

fs.writeFileSync('lib/walletconnect.ts', wcContent);
