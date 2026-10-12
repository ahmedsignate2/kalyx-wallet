/**
 * Vrai quand l'app tourne dans Expo Go sur iOS.
 *
 * Expo Go a son propre Info.plist : ni `NSFaceIDUsageDescription` (Face ID
 * refusé par iOS, et `requireAuthentication` d'expo-secure-store lève), ni les
 * schémas de redirection Google de Kalyx (OAuth Drive impossible). Ces
 * fonctions sont donc présentées comme indisponibles au lieu d'échouer.
 * Android n'est pas concerné.
 */
let cached: boolean | undefined;

export function isExpoGoIos(): boolean {
  if (cached !== undefined) return cached;
  try {
    const mod = require('expo-constants') as { default?: ExpoConstantsLike } & ExpoConstantsLike;
    const c = mod.default ?? mod;
    cached = c.executionEnvironment === 'storeClient' && !!c.platform?.ios;
  } catch {
    cached = false;
  }
  return cached;
}

interface ExpoConstantsLike {
  executionEnvironment?: string;
  platform?: { ios?: unknown };
}
