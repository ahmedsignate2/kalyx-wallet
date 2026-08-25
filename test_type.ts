import { deriveBtcSigner } from './src';
const signer = deriveBtcSigner(new Uint8Array(32), 0);
signer.privateKey;
