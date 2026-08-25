const fs = require('fs');
let content = fs.readFileSync('lib/walletconnect.ts', 'utf8');

content = content.replace('result = { signedTransaction: res };', 'result = { signature: res, transaction: res };');
content = content.replace('result = { signedTransactions: res };', 'result = { signatures: res, transactions: res };');

fs.writeFileSync('lib/walletconnect.ts', content);
