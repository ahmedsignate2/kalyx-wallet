const { withAndroidManifest } = require('expo/config-plugins');

/**
 * `android:allowBackup="false"` + `android:fullBackupContent="false"` sur <application>.
 *
 * Pourquoi : par défaut Android peut inclure les fichiers de l'app (AsyncStorage,
 * bases SQLite…) dans une sauvegarde cloud (Auto Backup) ou `adb backup`. Le
 * coffre chiffré (clés privées) vit dans le Keystore et n'est de toute façon
 * jamais exportable, mais les métadonnées locales (carnet d'adresses, réseaux
 * perso, préférences) n'ont aucune raison de quitter l'appareil — cohérent avec
 * la politique « zéro télémétrie, aucune donnée hors de l'appareil » de Kalyx.
 * Ni `expo-build-properties` ni les plugins installés n'exposent ce réglage :
 * un mini-plugin local est le chemin recommandé par Expo pour ce cas.
 */
function withAndroidNoBackup(config) {
  return withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application?.[0];
    if (app) {
      app.$['android:allowBackup'] = 'false';
      app.$['android:fullBackupContent'] = 'false';
    }
    return config;
  });
}

module.exports = withAndroidNoBackup;
