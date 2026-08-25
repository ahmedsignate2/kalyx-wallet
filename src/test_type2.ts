import { deriveBtcSigner } from './index';
const signer = deriveBtcSigner(new Uint8Array(32), 0);
console.log(signer.privateKey);
