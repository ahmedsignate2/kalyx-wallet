/**
 * Authentification biométrique (Face ID / Touch ID / empreinte).
 * Fine couche au-dessus d'expo-local-authentication.
 */
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';
import { useSettings } from './settingsStore';
import { translate } from './i18n';
import { isExpoGoIos } from './expoGo';

export async function isBiometricAvailable(): Promise<boolean> {
  if (isExpoGoIos()) return false;
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  return hasHardware && enrolled;
}

/**
 * Biométrie VERROUILLÉE par le système (trop d'échecs Face ID / Touch ID) ?
 * Sondage SANS invite, à faire après un refus : le trousseau rend alors la
 * même erreur qu'une annulation, et l'écran restait muet — le bouton ne
 * faisait plus rien. iOS : en verrouillage, `isEnrolledAsync` reste vrai
 * (il tolère explicitement le lockout) alors que le niveau retombe sous
 * « biométrique » : c'est cette différence qui le trahit. Android ne la montre
 * pas (le niveau ne bouge pas) : faux, on n'invente jamais un verrouillage.
 */
export async function isBiometricLockedOut(): Promise<boolean> {
  if (Platform.OS !== 'ios' || isExpoGoIos()) return false;
  try {
    const [hasHardware, enrolled, level] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.getEnrolledLevelAsync(),
    ]);
    return hasHardware && enrolled && level < LocalAuthentication.SecurityLevel.BIOMETRIC_WEAK;
  } catch {
    return false;
  }
}

/** Demande l'authentification. Renvoie true si l'utilisateur réussit. */
export async function authenticate(reason?: string): Promise<boolean> {
  const lang = useSettings.getState().language;
  const startedAt = Date.now();
  console.log('[KALYX-AUTH][biometrics] authenticate:start', { reason });
  try {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: reason ?? translate(lang, 'unlockKalyx'),
      cancelLabel: translate(lang, 'bioUseAppPin'),
      /*
       * EMPREINTE OU VISAGE SEULEMENT. À `false`, Android proposait « utiliser
       * le code du téléphone » : quiconque connaît le code de déverrouillage de
       * l'appareil — souvent vu par-dessus l'épaule — ouvrait le portefeuille
       * sans jamais connaître le PIN Kalyx. Annuler ramène au PIN de l'app.
       */
      disableDeviceFallback: true,
    });
    console.log('[KALYX-AUTH][biometrics] authenticate:resolved', {
      elapsedMs: Date.now() - startedAt,
      success: res.success,
      error: res.success ? null : res.error ?? null,
    });
    return res.success;
  } catch (error) {
    console.warn('[KALYX-AUTH][biometrics] authenticate:rejected', {
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/** Texte de l'invite biométrique affichée par le système (copie protégée du coffre). */
export function biometricPrompt(): string {
  return translate(useSettings.getState().language, 'unlockKalyx');
}
