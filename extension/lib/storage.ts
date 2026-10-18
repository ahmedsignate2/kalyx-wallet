/**
 * Stockage de l'extension, en deux zones qui ne se confondent jamais :
 *
 *  - `disk`    (`storage.local`)   : persistant. Uniquement du CHIFFRÉ (coffre)
 *                                    et des préférences sans valeur pour un voleur ;
 *  - `session` (`storage.session`) : en mémoire, vidé à la fermeture du
 *                                    navigateur, inaccessible aux pages web. C'est
 *                                    là — et seulement là — que vivra la clé de
 *                                    session une fois l'extension déverrouillée.
 *
 * Les clés sont préfixées : une donnée d'une version future ou d'un essai ne
 * se mélange pas aux nôtres.
 */

/** Ce dont on a besoin d'une zone de stockage (le navigateur, ou une imitation en test). */
export interface StorageArea {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

const PREFIX = 'kalyx.';

export interface Store {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

export function makeStore(area: StorageArea): Store {
  return {
    async get<T>(key: string) {
      const k = PREFIX + key;
      return (await area.get([k]))[k] as T | undefined;
    },
    async set<T>(key: string, value: T) {
      await area.set({ [PREFIX + key]: value });
    },
    async remove(key: string) {
      await area.remove([PREFIX + key]);
    },
  };
}

/**
 * Zone session réservée à l'extension. C'est déjà le réglage par défaut de
 * Chrome ; on le fixe explicitement pour qu'un changement futur ne l'ouvre pas
 * aux scripts de contenu.
 */
export async function lockSessionToExtension(session: { setAccessLevel?: (o: { accessLevel: string }) => Promise<void> }): Promise<void> {
  await session.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' });
}
