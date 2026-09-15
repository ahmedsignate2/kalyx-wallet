/**
 * Lien de téléchargement de l'APK : GitHub Release par défaut (l'asset doit
 * s'appeler exactement `kalyx-wallet.apk`). Surcharge possible via NEXT_PUBLIC_APK_URL.
 */
/** Par défaut : l'asset « kalyx-wallet.apk » de la dernière GitHub Release (aucune limite de taille d'hébergeur). */
export const APK_URL =
  process.env.NEXT_PUBLIC_APK_URL?.trim() || 'https://github.com/gadget00522/Nova-mise-a-jour/releases/latest/download/kalyx-wallet.apk';
