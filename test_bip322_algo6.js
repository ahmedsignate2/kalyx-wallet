import * as btc from '@scure/btc-signer';
import { hex } from '@scure/base';

// Let's create an address and get its script
const privKey = hex.decode('0000000000000000000000000000000000000000000000000000000000000001');
const p2wpkh = btc.p2wpkh(privKey);
const addr = btc.getAddress('wpkh', privKey, btc.NETWORK);
const decoded = btc.Address(btc.NETWORK).decode(addr);
const script = btc.OutScript.encode(decoded);

console.log(hex.encode(script) === hex.encode(p2wpkh.script));
