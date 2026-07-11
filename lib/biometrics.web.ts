/**
 * Biométrie — variante WEB.
 * Pas de Face ID / Touch ID sur navigateur : on désactive proprement.
 * L'utilisateur déverrouille au PIN (le coffre reste chiffré AES sous le PIN).
 */
export async function isBiometricAvailable(): Promise<boolean> {
  return false;
}

export async function authenticate(_reason?: string): Promise<boolean> {
  return false;
}
