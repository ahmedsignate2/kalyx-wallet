const fs = require('fs');

let wcContent = fs.readFileSync('lib/walletconnect.ts', 'utf8');
// restore result = { signature: sig }
wcContent = wcContent.replace(
  "result = sig;\n      } else if (method === 'bitcoin_signPsbt'",
  "result = { signature: sig };\n      } else if (method === 'bitcoin_signPsbt'"
);
fs.writeFileSync('lib/walletconnect.ts', wcContent);
