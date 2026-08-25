const fs = require('fs');
let content = fs.readFileSync('lib/walletconnect.ts', 'utf8');

content = content.replace(/get\(\)\.wallet\.accounts\[get\(\)\.wallet\.activeAccountIndex\]\?\.solAddress/g, 'useWallet.getState().accounts[useWallet.getState().activeAccountIndex]?.solAddress');

fs.writeFileSync('lib/walletconnect.ts', content);
