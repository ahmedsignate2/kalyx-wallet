/**
 * App distribuée en APK direct (hors store) : pas d'OTA (expo-updates). Au démarrage,
 * on interroge la dernière GitHub Release (lib/appUpdateCheck.ts) et on propose le
 * téléchargement si une version plus récente existe. Silencieux si hors ligne, throttlé
 * à ~1 fois/20h, et ne repropose pas une version déjà refusée.
 */
import { useEffect } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import { checkForUpdateThrottled, dismissUpdate } from '../lib/appUpdateCheck';
import { useT } from '../lib/settingsStore';

export function UpdateChecker() {
  const t = useT();

  useEffect(() => {
    if (Platform.OS === 'web') return;
    // Laisse le démarrage (bootstrap, polices, wallet) se stabiliser avant l'appel réseau.
    const timer = setTimeout(() => {
      checkForUpdateThrottled().then((info) => {
        if (!info) return;
        Alert.alert(t('updateAvailableTitle'), `${t('updateAvailableBody')} (v${info.version})`, [
          { text: t('updateLater'), style: 'cancel', onPress: () => dismissUpdate(info.version) },
          { text: t('updateNow'), onPress: () => Linking.openURL(info.downloadUrl).catch(() => {}) },
        ]);
      });
    }, 4000);
    return () => clearTimeout(timer);
  }, [t]);

  return null;
}
