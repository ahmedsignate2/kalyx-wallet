const { VersionedTransaction, TransactionMessage, Keypair } = require('@solana/web3.js');
const payer = Keypair.generate();
const msg = new TransactionMessage({
  payerKey: payer.publicKey,
  recentBlockhash: '11111111111111111111111111111111',
  instructions: []
}).compileToV0Message();
const tx = new VersionedTransaction(msg);
tx.sign([payer]);
console.log('signatures length:', tx.signatures.length);
console.log('first sig length:', tx.signatures[0].length);
console.log('keys:', msg.staticAccountKeys.map(k => k.toBase58()));
