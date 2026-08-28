const fs = require('fs');
let code = fs.readFileSync('src/domain/swap/lifi.ts', 'utf8');

// Update Swap Fee (NOVA_FEE) to 0.5%
code = code.replace(/export const NOVA_FEE = '0\.003'; \/\/ 0,3 %/g, "export const NOVA_FEE = '0.005'; // 0,5 %");

// Update Staking Fee (EARN_FEE) to 0%
code = code.replace(/const EARN_FEE = '0\.005'; \/\/ 0,5% pour le Staking\/Earn/g, "const EARN_FEE = '0'; // 0% pour le Staking/Earn");

fs.writeFileSync('src/domain/swap/lifi.ts', code);
