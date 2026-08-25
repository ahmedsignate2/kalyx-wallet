import { deriveBtcSigner } from './src/crypto/btc';
type SignerType = ReturnType<typeof deriveBtcSigner>;
const check: SignerType = { privateKey: new Uint8Array(32), publicKey: new Uint8Array(33), address: 'test' };
