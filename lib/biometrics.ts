/**
 * Authentification biométrique (Face ID / Touch ID / empreinte).
 * Fine couche au-dessus d'expo-local-authentication.
 */
import * as LocalAuthentication from 'expo-local-authentication';

export async function isBiometricAvailable(): Promise<boolean> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  return hasHardware && enrolled;
}

/** Demande l'authentification. Renvoie true si l'utilisateur réussit. */
export async function authenticate(reason = 'Déverrouiller Kalyx Wallet'): Promise<boolean> {
  const startedAt = Date.now();
  console.log('[KALYX-AUTH][biometrics] authenticate:start', { reason });
  try {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      cancelLabel: 'Utiliser le PIN',
      disableDeviceFallback: false,
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
