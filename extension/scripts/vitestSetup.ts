/** Tests : `require('@ton/crypto')` (depuis @ton/core) servi par scripts/tonCrypto.cjs. */
import Module from 'node:module';
import { fileURLToPath } from 'node:url';

const SHIM = fileURLToPath(new URL('./tonCrypto.cjs', import.meta.url));
const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
const resolve = M._resolveFilename;
M._resolveFilename = function (req: string, ...rest: unknown[]) {
  return req === '@ton/crypto' ? SHIM : resolve.call(this, req, ...rest);
};
