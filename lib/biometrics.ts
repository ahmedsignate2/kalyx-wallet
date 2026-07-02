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
export async function authenticate(reason = 'Déverrouiller Nova Wallet'): Promise<boolean> {
  const res = await LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    cancelLabel: 'Utiliser le PIN',
    disableDeviceFallback: false,
  });
  return res.success;
}
