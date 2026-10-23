import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * Modules du cœur et de l'app remplacés, POUR L'EXTENSION, par leur version
 * navigateur. Le cœur reste inchangé ; l'extension n'embarque ni ce qu'elle
 * ne sert pas (TON) ni les stores de l'app mobile.
 *  - registre des réseaux → EVM, Solana et Bitcoin ;
 *  - journal technique de l'app → aucun journal ;
 *  - échanges STON.fi (TON) → aucun routeur TON accepté par le garde.
 */
const SUBSTITUTES = new Map([
  [at('../../src/domain/chains/registry.ts'), at('../lib/chainRegistry.ts')],
  [at('../../lib/technicalLogger.ts'), at('../lib/noLog.ts')],
  [at('../../src/domain/swap/stonfi.ts'), at('../lib/noStonfi.ts')],
]);
const OURS = new Set(SUBSTITUTES.values());

export function extensionRegistry(): Plugin {
  return {
    name: 'kalyx-extension-substitutes',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer || OURS.has(importer) || !/(registry|technicalLogger|stonfi)(\.ts)?$/.test(source)) return null;
      const r = await this.resolve(source, importer, { ...options, skipSelf: true });
      return (r && SUBSTITUTES.get(r.id)) ?? null;
    },
  };
}
