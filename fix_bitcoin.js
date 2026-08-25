const fs = require('fs');
let content = fs.readFileSync('lib/walletconnect.ts', 'utf8');

// Change default signing type to bip322 for Bitcoin
const oldLogic = `        let type = 'ecdsa';
        if (pSafe.type === 'bip322-simple' || pSafe[0]?.type === 'bip322-simple') type = 'bip322';`;
const newLogic = `        let type = 'bip322';
        if (pSafe.type === 'ecdsa' || pSafe[0]?.type === 'ecdsa') type = 'ecdsa';`;

content = content.replace(oldLogic, newLogic);
fs.writeFileSync('lib/walletconnect.ts', content);
