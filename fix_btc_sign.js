const fs = require('fs');

// 1. Revert default to ecdsa in walletconnect.ts
let wcContent = fs.readFileSync('lib/walletconnect.ts', 'utf8');
const oldTypeLogic = `let type = 'bip322';
        if (pSafe.type === 'ecdsa' || pSafe[0]?.type === 'ecdsa') type = 'ecdsa';`;
const newTypeLogic = `let type = 'ecdsa';
        if (pSafe.type === 'bip322-simple' || pSafe[0]?.type === 'bip322-simple') type = 'bip322';`;
wcContent = wcContent.replace(oldTypeLogic, newTypeLogic);
fs.writeFileSync('lib/walletconnect.ts', wcContent);

// 2. Change header to 31 + sig.recovery in walletStore.ts
let storeContent = fs.readFileSync('lib/walletStore.ts', 'utf8');
storeContent = storeContent.replace('const header = 39 + sig.recovery;', 'const header = 31 + sig.recovery;');
fs.writeFileSync('lib/walletStore.ts', storeContent);

