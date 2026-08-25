import { mnemonicToSeedSync } from '@scure/bip39';
import { deriveBtcAccount } from './src/domain/chains/btcTx.js';
console.log(deriveBtcAccount.toString());
