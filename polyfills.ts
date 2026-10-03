/**
 * IMPORTANT : ce fichier doit être importé EN TOUT PREMIER (voir index.js),
 * avant tout code crypto. Il installe `globalThis.crypto.getRandomValues`,
 * sans quoi la génération de seed ne serait pas cryptographiquement sûre.
 */
import 'react-native-get-random-values';
import { Buffer } from 'buffer';
import { installBufferSubarrayFix } from './src/polyfills/bufferSubarray';

if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}

/*
 * `subarray` doit rendre un Buffer. Hermes ignore `Symbol.species` pour les
 * tableaux typés : il rendait un Uint8Array nu, et `@ton/core` plantait AU
 * DÉMARRAGE en appelant `.copy` dessus (`undefined is not a function`). Posé
 * sur le Buffer importé ET sur le global, au cas où ce ne serait pas le même.
 * Détails et reproduction : `src/polyfills/bufferSubarray.ts`.
 */
installBufferSubarrayFix(Buffer as never);
installBufferSubarrayFix(global.Buffer as never);
