/**
 * Détection d'appareil compromis (root Android / jailbreak iOS) via jail-monkey.
 *
 * Module natif → require dynamique et sûr : renvoie « non compromis » tant que
 * le dev build ne l'embarque pas (pas de crash avant rebuild). Un appareil rooté
 * peut contourner le stockage sécurisé : on avertit l'utilisateur, sans bloquer.
 */
type JailMonkey = { isJailBroken: () => boolean; trustFall?: () => boolean };

let mod: JailMonkey | null | undefined;

function get(): JailMonkey | null {
  if (mod !== undefined) return mod;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    mod = require('jail-monkey') as JailMonkey;
  } catch {
    mod = null;
  }
  return mod;
}

/** True si l'appareil est rooté/jailbreaké (false si indéterminable). */
export function isDeviceCompromised(): boolean {
  const jm = get();
  try {
    return !!jm?.isJailBroken?.();
  } catch {
    return false;
  }
}
