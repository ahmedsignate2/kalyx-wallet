const fs = require('fs');
let code = fs.readFileSync('lib/walletStore.ts', 'utf8');

// Remove from interface
code = code.replace(/\n\s*stakeSolana:\s*\(validatorPubkey:\s*string,\s*amount:\s*string,\s*unlock:\s*Unlock\)\s*=>\s*Promise<string>;/, '');

// Remove implementation
code = code.replace(/\n\s*stakeSolana:\s*async\s*\(validatorPubkey,\s*amount,\s*unlock\)\s*=>\s*\{[\s\S]*?return adapter\.sendStakeDelegation[\s\S]*?\}\);[\s\S]*?\},/, '');

fs.writeFileSync('lib/walletStore.ts', code);
