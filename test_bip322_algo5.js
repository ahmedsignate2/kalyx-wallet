import * as btc from '@scure/btc-signer';
const toSpendTx = new btc.Transaction({ version: 0, allowUnknownOutputs: true });
console.log(toSpendTx.version);
