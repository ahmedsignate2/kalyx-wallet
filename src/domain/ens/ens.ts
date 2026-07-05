/**
 * Résolution ENS (Ethereum Name Service).
 *
 * L'ENS vit sur Ethereum MAINNET, quel que soit le réseau actif du wallet : on
 * résout donc toujours via un provider mainnet dédié (construit à partir de la
 * config ETHEREUM). Trois usages :
 *  - forward : `vitalik.eth` → adresse (saisie d'un envoi) ;
 *  - reverse : adresse → `vitalik.eth` (affichage historique/contacts) ;
 *  - avatar  : `vitalik.eth` → URL d'image.
 *
 * Tout est mis en cache (TTL court) et dégradé gracieusement : la moindre
 * erreur réseau renvoie `null`, jamais d'exception qui casserait un écran.
 * La détection `looksLikeEnsName` est pure et testée hors-ligne.
 */
import { JsonRpcProvider } from 'ethers';
import { ETHEREUM } from '../chains/configs';

/** Interface minimale d'un résolveur (permet d'injecter un mock en test). */
export interface EnsProvider {
  resolveName(name: string): Promise<string | null>;
  lookupAddress(address: string): Promise<string | null>;
  getAvatar(name: string): Promise<string | null>;
}

const TTL_MS = 5 * 60_000; // 5 min : l'ENS change rarement, on évite de spammer

interface CacheEntry<T> {
  value: T;
  exp: number;
}
const fwdCache = new Map<string, CacheEntry<string | null>>();
const revCache = new Map<string, CacheEntry<string | null>>();
const avatarCache = new Map<string, CacheEntry<string | null>>();

function cached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | undefined {
  const e = cache.get(key);
  if (e && e.exp > Date.now()) return e.value;
  if (e) cache.delete(key);
  return undefined;
}
function store<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T): T {
  cache.set(key, { value, exp: Date.now() + TTL_MS });
  return value;
}

let providers: EnsProvider[] | undefined;
/** Providers mainnet (lazy) : Alchemy en tête si dispo, publics en repli. */
function mainnetProviders(): EnsProvider[] {
  if (!providers) {
    providers = ETHEREUM.rpcUrls.map(
      (u) => new JsonRpcProvider(u, 1, { staticNetwork: true }) as unknown as EnsProvider,
    );
  }
  return providers;
}

/** Essaie `op` sur chaque provider ; premier résultat non-null gagne, sinon null. */
async function tryProviders<T>(
  op: (p: EnsProvider) => Promise<T | null>,
  list: EnsProvider[],
): Promise<T | null> {
  for (const p of list) {
    try {
      const r = await op(p);
      if (r != null) return r;
    } catch {
      /* provider suivant */
    }
  }
  return null;
}

/**
 * Vrai si la saisie ressemble à un nom ENS `.eth` (y compris sous-domaines).
 * Pure : sert de déclencheur AVANT tout appel réseau. Insensible à la casse.
 */
export function looksLikeEnsName(input: string): boolean {
  const s = input.trim().toLowerCase();
  if (s.length < 5 || s.length > 255) return false; // "a.eth" min
  return /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+eth$/.test(s);
}

/** Forward : nom ENS → adresse (0x…), ou null. Cache + repli providers. */
export async function resolveEnsName(name: string, provider?: EnsProvider): Promise<string | null> {
  const key = name.trim().toLowerCase();
  if (!looksLikeEnsName(key)) return null;
  const hit = cached(fwdCache, key);
  if (hit !== undefined) return hit;
  const list = provider ? [provider] : mainnetProviders();
  const addr = await tryProviders((p) => p.resolveName(key), list);
  return store(fwdCache, key, addr);
}

/** Reverse : adresse → nom ENS primaire (vérifié), ou null. Cache + repli. */
export async function lookupEnsName(address: string, provider?: EnsProvider): Promise<string | null> {
  const key = address.trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(key)) return null;
  const hit = cached(revCache, key);
  if (hit !== undefined) return hit;
  const list = provider ? [provider] : mainnetProviders();
  const name = await tryProviders((p) => p.lookupAddress(key), list);
  return store(revCache, key, name);
}

/** Avatar : nom ENS → URL d'image, ou null. Cache + repli. */
export async function resolveEnsAvatar(name: string, provider?: EnsProvider): Promise<string | null> {
  const key = name.trim().toLowerCase();
  if (!looksLikeEnsName(key)) return null;
  const hit = cached(avatarCache, key);
  if (hit !== undefined) return hit;
  const list = provider ? [provider] : mainnetProviders();
  const url = await tryProviders((p) => p.getAvatar(key), list);
  return store(avatarCache, key, url);
}

/** Vide les caches (utile en test). */
export function _clearEnsCache(): void {
  fwdCache.clear();
  revCache.clear();
  avatarCache.clear();
}
