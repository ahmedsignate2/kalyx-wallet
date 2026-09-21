/** Liens officiels — source unique pour le site vitrine. */
/** Tableau de bord web (lecture seule + signatures relayées au téléphone). */
export const WEB_APP_URL = process.env.NEXT_PUBLIC_WEB_APP_URL?.trim() || 'https://app.kalyxwallet.com';
/** Code source (propriétaire, consultable). */
export const SOURCE_URL = 'https://github.com/ahmedsignate2/kalyx-wallet';
/** Politique de sécurité / signalement de faille. */
export const SECURITY_URL = `${SOURCE_URL}/blob/main/SECURITY.md`;
/** Dépôt de distribution : APK signé + empreinte SHA-256 par version. */
export const RELEASES_URL = 'https://github.com/ahmedsignate2/kalyx-wallet-release/releases';
export const RELEASE_LATEST_URL = `${RELEASES_URL}/latest`;
export const CHECKSUM_URL = `${RELEASE_LATEST_URL}/download/kalyx-wallet.apk.sha256`;
