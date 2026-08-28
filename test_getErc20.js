const fs = require('fs');
const code = fs.readFileSync('app/wallet.tsx', 'utf8');
const match = code.match(/getErc20Tokens/g);
console.log('Matches in wallet.tsx:', match ? match.length : 0);
