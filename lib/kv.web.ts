/**
 * Stockage clé-valeur — implémentation WEB.
 *
 * expo-secure-store n'existe pas sur navigateur : on retombe sur localStorage.
 * ⚠️ localStorage n'est PAS chiffré au repos par l'OS. Le coffre du wallet reste
 * néanmoins chiffré AES-256-GCM sous le PIN (voir src/security/vault) avant d'y
 * être écrit — donc le secret n'est jamais en clair. La copie biométrique n'est
 * pas utilisée sur web (pas de biométrie navigateur ici).
 */
type Opts = unknown;

interface WebStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
// localStorage n'est pas typé sans la lib DOM (tsconfig ciblé mobile) : accès gardé.
const store = (): WebStorage | undefined =>
  (globalThis as { localStorage?: WebStorage }).localStorage;

export async function kvSet(key: string, value: string, _opts?: Opts): Promise<void> {
  try {
    store()?.setItem(key, value);
  } catch {
    /* quota / mode privé : on ignore */
  }
}

export async function kvGet(key: string, _opts?: Opts): Promise<string | null> {
  try {
    return store()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export async function kvDel(key: string, _opts?: Opts): Promise<void> {
  try {
    store()?.removeItem(key);
  } catch {
    /* ignore */
  }
}
