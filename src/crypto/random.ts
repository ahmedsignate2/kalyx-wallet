/**
 * Génération d'aléatoire cryptographiquement sûr (CSPRNG).
 *
 * Source unique : `globalThis.crypto.getRandomValues`. Elle est présente
 *  - sur mobile React Native, dès que `react-native-get-random-values` est
 *    importé au tout premier chargement (voir polyfills.ts) ;
 *  - dans Node 18+ (Web Crypto global), donc côté tests / desktop.
 *
 * On n'importe PAS le module `crypto` de Node : Metro l'analyse statiquement et
 * échoue à bundler pour React Native. On n'utilise JAMAIS Math.random().
 */
export function getRandomBytes(length: number): Uint8Array {
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error('getRandomBytes: length doit être un entier positif');
  }

  const g = globalThis as unknown as {
    crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array };
  };

  if (!g.crypto?.getRandomValues) {
    throw new Error(
      "CSPRNG indisponible : importe 'react-native-get-random-values' en tout " +
        'premier (polyfills.ts) sur mobile.',
    );
  }

  return g.crypto.getRandomValues(new Uint8Array(length));
}
