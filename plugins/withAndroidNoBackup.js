const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

/**
 * Aucune donnée de l'app ne quitte l'appareil par les mécanismes d'Android.
 *
 *  - `android:allowBackup="false"` + `android:fullBackupContent="false"` :
 *    ni sauvegarde cloud (Auto Backup) ni `adb backup` (Android ≤ 11).
 *  - `android:dataExtractionRules` (Android 12+) : `allowBackup=false` NE COUVRE
 *    PAS le transfert d'appareil à appareil (câble ou Wi-Fi au changement de
 *    téléphone). Les règles ci-dessous excluent tous les domaines, des deux
 *    côtés : sauvegarde cloud ET transfert.
 *
 * Pourquoi : AsyncStorage contient en clair l'historique, les sites connectés,
 * les onglets, les conversations avec l'assistant et le journal de diagnostic.
 * Le coffre (Keystore) ne se transfère de toute façon pas — recopier le reste
 * sur un autre appareil ne servirait à rien et exposerait ces métadonnées.
 * Politique Kalyx : « aucune donnée hors de l'appareil ». Ni
 * `expo-build-properties` ni les plugins installés n'exposent ces réglages :
 * un mini-plugin local est le chemin recommandé par Expo pour ce cas.
 */
const RULES_NAME = 'kalyx_data_extraction_rules';
const DOMAINS = ['root', 'file', 'database', 'sharedpref', 'external'];
const excludeAll = DOMAINS.map((d) => `    <exclude domain="${d}" path="." />`).join('\n');
const RULES_XML = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup>
${excludeAll}
  </cloud-backup>
  <device-transfer>
${excludeAll}
  </device-transfer>
</data-extraction-rules>
`;

function withAndroidNoBackup(config) {
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const dir = path.join(config.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${RULES_NAME}.xml`), RULES_XML);
      return config;
    },
  ]);
  return withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application?.[0];
    if (app) {
      app.$['android:allowBackup'] = 'false';
      app.$['android:fullBackupContent'] = 'false';
      app.$['android:dataExtractionRules'] = `@xml/${RULES_NAME}`;
    }
    return config;
  });
}

module.exports = withAndroidNoBackup;
