/**
 * PROFILS : le vrai, ou le LEURRE ouvert par le code de contrainte.
 *
 * Les modules (portefeuilles, carnet, liste blanche, sites connectés, tokens
 * ajoutés, caches) écrivent sur le disque par ce magasin : en profil leurre,
 * leurs clés sont préfixées `decoy.` et ne voient jamais celles du vrai
 * profil. Les réglages de l'extension elle-même (coffres, freinage, langue,
 * verrouillage, présence sur les sites…) restent communs : les montrer
 * différents trahirait le leurre.
 *
 * Le profil vit dans la zone session (vidée à la fermeture du navigateur) et
 * disparaît au verrouillage.
 */
import type { Store } from './storage';

export type Profile = 'main' | 'decoy';
export const PROFILE_KEY = 'profile';
const DECOY_PREFIX = 'decoy.';

/** Clés communes aux deux profils. */
const GLOBAL = new Set(['vault', 'decoyVault', 'throttle', 'autoLockMin', 'paranoid', 'lang', 'siteMode', 'allowedSites', 'defaultProvider', 'askPasswordToSign']);

export const profileOf = async (session: Store): Promise<Profile> => ((await session.get<string>(PROFILE_KEY)) === 'decoy' ? 'decoy' : 'main');

export function makeProfiledStore(base: Store, session: Store): Store {
  const k = async (key: string) => (GLOBAL.has(key) || (await profileOf(session)) === 'main' ? key : DECOY_PREFIX + key);
  return {
    get: async <T>(key: string) => base.get<T>(await k(key)),
    set: async <T>(key: string, value: T) => base.set(await k(key), value),
    remove: async (key: string) => base.remove(await k(key)),
  };
}

/** Préfixe des données du profil leurre sur le disque (storage.local), pour tout effacer d'un coup. */
export const DECOY_DISK_PREFIX = `kalyx.${DECOY_PREFIX}`;
