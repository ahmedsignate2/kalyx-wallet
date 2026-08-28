const fs = require('fs');

let code = fs.readFileSync('lib/walletStore.ts', 'utf8');

const regex = /\/\/ -- FIX: Auto-refresh blockhash[\s\S]*?\/\/ -----------------------------------------------------------------------------------------/g;

code = code.replace(regex, '');

fs.writeFileSync('lib/walletStore.ts', code);
