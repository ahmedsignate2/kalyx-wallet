/**
 * IMPORTANT : ce fichier doit être importé EN TOUT PREMIER (voir index.js),
 * avant tout code crypto. Il installe `globalThis.crypto.getRandomValues`,
 * sans quoi la génération de seed ne serait pas cryptographiquement sûre.
 */
import 'react-native-get-random-values';
import { Buffer } from 'buffer';

if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}
