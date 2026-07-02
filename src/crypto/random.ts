/**
 * Génération d'aléatoire cryptographiquement sûr (CSPRNG).
 *
 * En React Native, `react-native-get-random-values` doit être importé au tout
 * début de l'app pour installer `globalThis.crypto.getRandomValues`. Ici on
 * l'utilise s'il est présent, sinon on retombe sur le module `crypto` de Node
 * (tests / desktop). On n'utilise JAMAIS Math.random() pour de la crypto.
 */
export function getRandomBytes(length: number): Uint8Array {
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error('getRandomBytes: length doit être un entier positif');
  }
  const bytes = new Uint8Array(length);

  const g = globalThis as unknown as {
    crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array };
  };

  if (g.crypto?.getRandomValues) {
    g.crypto.getRandomValues(bytes);
    return bytes;
  }

  // Fallback Node (jamais atteint sur mobile si le polyfill est chargé).
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nodeCrypto = require('crypto') as typeof import('crypto');
  nodeCrypto.randomFillSync(bytes);
  return bytes;
}
