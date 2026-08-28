const fs = require('fs');
let code = fs.readFileSync('src/domain/swap/lifi.ts', 'utf8');

code = code.replace(/export const NOVA_FEE = '0\.005'; \/\/ 0,5 %/g, "export const NOVA_FEE = '0.003'; // 0,3 %");

fs.writeFileSync('src/domain/swap/lifi.ts', code);
