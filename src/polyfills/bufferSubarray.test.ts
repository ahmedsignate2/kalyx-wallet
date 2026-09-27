/**
 * Reproduit sous Node le plantage du téléphone, puis prouve le correctif.
 *
 * Deux conditions du téléphone à recréer :
 * 1. le `Buffer` global est le paquet npm `buffer` (installé par `polyfills.ts`),
 *    pas le `Buffer` natif de Node — d'où `require('buffer/')`, la barre finale
 *    forçant le paquet plutôt que le module natif ;
 * 2. Hermes ignore `Symbol.species` pour les tableaux typés : on donne à ce
 *    `Buffer` une espèce `Uint8Array`, et `subarray` rend alors un `Uint8Array` nu.
 */
import { beginCell } from '@ton/core';
import { installBufferSubarrayFix } from './bufferSubarray';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const NpmBuffer = require('buffer/').Buffer as typeof Buffer;

function onPhone<T>(fn: () => T): T {
  const original = globalThis.Buffer;
  globalThis.Buffer = NpmBuffer;
  Object.defineProperty(NpmBuffer, Symbol.species, { value: Uint8Array, configurable: true });
  try {
    return fn();
  } finally {
    delete (NpmBuffer as unknown as Record<symbol, unknown>)[Symbol.species];
    globalThis.Buffer = original;
  }
}

const cellHash = () => beginCell().storeUint(0x2a, 8).storeStringTail('kalyx').endCell().hash().toString('hex');

describe('Buffer.subarray comme sous Hermes', () => {
  const reference = cellHash(); // Node, sans rien simuler

  it('SANS correctif : le plantage du téléphone est reproduit', () => {
    onPhone(() => {
      expect(typeof (NpmBuffer.alloc(8).subarray(0, 4) as Buffer).copy).toBe('undefined');
      expect(cellHash).toThrow(/is not a function/);
    });
  });

  it('AVEC correctif : subarray rend un Buffer, et les cellules TON se construisent à l’identique', () => {
    installBufferSubarrayFix(NpmBuffer as never);
    onPhone(() => {
      const sub = NpmBuffer.from([1, 2, 3, 4]).subarray(1, 3);
      expect(typeof sub.copy).toBe('function');
      expect([...sub]).toEqual([2, 3]);
      expect(cellHash()).toBe(reference);
    });
  });

  it('partage la mémoire (pas de copie) et reste idempotent', () => {
    installBufferSubarrayFix(NpmBuffer as never);
    const b = NpmBuffer.from([1, 2, 3]);
    b.subarray(1)[0] = 9;
    expect(b[1]).toBe(9);
  });
});
