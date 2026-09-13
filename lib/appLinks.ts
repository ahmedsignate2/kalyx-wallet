/**
 * Liens de l'application (partage, invitation, deep links).
 *
 * - PLAY_STORE_URL : lien universel — ouvre le Play Store ; si Kalyx est déjà
 *   installée, le store propose « Ouvrir ». Fiable partout, sans serveur.
 * - androidSmartLink : URL `intent://` (Chrome Android uniquement) qui ouvre
 *   DIRECTEMENT l'app si installée, sinon retombe sur le Play Store.
 *
 * NB : le « vrai » App Link https (ouvre l'app depuis n'importe quel lien) exige
 * un domaine hébergeant un fichier assetlinks.json — à faire quand kalyx.wallet
 * sera en ligne. En attendant, le lien Play Store est la solution honnête.
 */
export const ANDROID_PACKAGE = 'com.kalyx.wallet';
export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
export const APP_SCHEME = 'kalyx';

/** URL intent:// : ouvre Kalyx (scheme) si installée, sinon fallback Play Store. */
export function androidSmartLink(path = 'invite'): string {
  const fallback = encodeURIComponent(PLAY_STORE_URL);
  return `intent://${path}#Intent;scheme=${APP_SCHEME};package=${ANDROID_PACKAGE};S.browser_fallback_url=${fallback};end`;
}
