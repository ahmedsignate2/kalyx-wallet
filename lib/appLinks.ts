/**
 * Liens de l'application (partage, invitation, deep links).
 *
 * - DOWNLOAD_URL : lien à partager, TOUJOURS — jamais l'URL d'un store précis.
 *   kalyxwallet.com/download détecte l'appareil et redirige vers le bon store
 *   (Galaxy Store aujourd'hui, d'autres demain — cf. web/lib/stores.ts), avec
 *   repli sur l'APK direct. Changer de store ou en ajouter un ne nécessite
 *   alors aucune mise à jour de l'app déjà installée.
 * - PLAY_STORE_URL : gardé pour le jour où la fiche Google Play existe
 *   réellement ; ne pas l'utiliser comme lien de partage tant qu'elle n'est
 *   pas publiée (lien mort sinon).
 * - androidSmartLink : URL `intent://` (Chrome Android uniquement) qui ouvre
 *   DIRECTEMENT l'app si installée, sinon retombe sur DOWNLOAD_URL.
 *
 * NB : le « vrai » App Link https (ouvre l'app depuis n'importe quel lien) exige
 * un domaine hébergeant un fichier assetlinks.json — à faire quand kalyx.wallet
 * sera en ligne. En attendant, le lien de téléchargement est la solution honnête.
 */
export const ANDROID_PACKAGE = 'com.kalyx.wallet';
export const DOWNLOAD_URL = 'https://kalyxwallet.com/download';
export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
export const APP_SCHEME = 'kalyx';

/** URL intent:// : ouvre Kalyx (scheme) si installée, sinon fallback sur le lien de téléchargement. */
export function androidSmartLink(path = 'invite'): string {
  const fallback = encodeURIComponent(DOWNLOAD_URL);
  return `intent://${path}#Intent;scheme=${APP_SCHEME};package=${ANDROID_PACKAGE};S.browser_fallback_url=${fallback};end`;
}
