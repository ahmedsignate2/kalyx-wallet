const fs = require('fs');
let content = fs.readFileSync('lib/walletStore.ts', 'utf8');

// Replace Keypair.fromSecretKey with Keypair.fromSeed
content = content.replace(
  'const keypair = Keypair.fromSecretKey(signer.secretKey);',
  'const keypair = Keypair.fromSeed(signer.secretKey);'
);

fs.writeFileSync('lib/walletStore.ts', content);
