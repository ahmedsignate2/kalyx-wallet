/**
 * `Buffer` global pour `@ton/core` (cellules, adresses TON), qui l'utilise sans
 * l'importer : présent dans Node et React Native (polyfills de l'app), absent
 * d'un service worker. Importé en PREMIER par le service worker.
 */
import { Buffer } from 'buffer';

const g = globalThis as { Buffer?: typeof Buffer };
g.Buffer ??= Buffer;
