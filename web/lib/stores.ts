/**
 * Registre des stores où Kalyx est publiée — source unique pour la page
 * d'aiguillage /download (web/app/(root)/download). Ajouter un store plus
 * tard = ajouter une entrée ici, jamais toucher à l'app déjà installée sur
 * le téléphone des utilisateurs (le bouton de partage pointe vers
 * kalyxwallet.com/download, jamais vers un store précis — cf. lib/appLinks.ts
 * côté app).
 */
import { APK_URL } from './apk';

export const ANDROID_PACKAGE = 'com.kalyx.wallet';

export interface StoreEntry {
  id: string;
  label: string;
  /** Détecte ce store depuis le user-agent du visiteur (redirection auto). */
  match: (ua: string) => boolean;
  /** Deep link tenté en premier (ouvre l'app du store si installée). */
  deepLink: string;
  /** Fiche web du store, affichée aussi comme bouton manuel toujours visible. */
  webUrl: string;
}

/** Stores où Kalyx est PUBLIÉE aujourd'hui. Ordre = priorité de détection. */
export const STORES: StoreEntry[] = [
  {
    id: 'galaxy-store',
    label: 'Samsung Galaxy Store',
    match: (ua) => /samsung|sm-[a-z0-9]/i.test(ua),
    deepLink: `samsungapps://ProductDetail/${ANDROID_PACKAGE}`,
    webUrl: `https://galaxystore.samsung.com/detail/${ANDROID_PACKAGE}`,
  },
  // Prochains stores (AppGallery, GetApps, App Market Oppo/Vivo, Amazon
  // Appstore, Google Play) : ajouter une entrée ici, avec son propre
  // `match`, `deepLink` et `webUrl'. Rien d'autre à changer.
];

/** Lien APK direct, universel — repli pour tout appareil Android non couvert par un store ci-dessus. */
export const DIRECT_APK_URL = APK_URL;
