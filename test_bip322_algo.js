import * as btc from '@scure/btc-signer';
import { sha256 } from '@noble/hashes/sha256';
import { utf8ToBytes, concatBytes } from '@noble/hashes/utils';
import { base64 } from '@scure/base';

// BIP322 simple signature generator
const TAG = utf8ToBytes('BIP0322-signed-message');
const tagHash = sha256(TAG);
const message = utf8ToBytes('Hello World');

const messageHash = sha256(concatBytes(tagHash, tagHash, message));

console.log(btc.utils.bytesToHex(messageHash));
