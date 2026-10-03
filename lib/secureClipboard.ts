/**
 * Copie d'un SECRET (clé privée) : le presse-papier est lisible par le clavier
 * et, sur les anciens Android, par n'importe quelle app. Il était laissé tel
 * quel indéfiniment. On l'efface après un délai — et seulement s'il contient
 * encore ce secret, pour ne pas écraser ce que l'utilisateur a copié depuis.
 */
import * as Clipboard from 'expo-clipboard';

let pending: ReturnType<typeof setTimeout> | null = null;
let current: string | null = null;

export async function copySecret(text: string, clearAfterMs = 60_000): Promise<void> {
  await Clipboard.setStringAsync(text);
  current = text;
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => void clearSecret(), clearAfterMs);
}

/** Efface le presse-papier s'il contient toujours le dernier secret copié. */
export async function clearSecret(): Promise<void> {
  if (pending) clearTimeout(pending);
  pending = null;
  const secret = current;
  current = null;
  if (!secret) return;
  try {
    if ((await Clipboard.getStringAsync()) === secret) await Clipboard.setStringAsync('');
  } catch {
    // Presse-papier inaccessible (app en arrière-plan) : le délai a au moins été tenté.
  }
}
