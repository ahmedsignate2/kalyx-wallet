/**
 * RÉGLAGES RÉSEAU DU DÉVELOPPEUR — RPC épinglés et bascule Mainnet/Testnets.
 *
 * Épingler un RPC le place EN TÊTE de l'ordre d'essai de sa chaîne
 * (src/domain/chains/net.ts → `rpcTryOrder`), tant qu'il n'est pas en panne.
 *
 * AUCUN SECRET PERSISTÉ. Une URL RPC peut porter une clé d'API (Alchemy
 * `/v2/<clé>`, Infura `/v3/<clé>`, `?apikey=`). On n'enregistre donc que sa
 * forme MASQUÉE (`displayRpcUrl`) ; au chargement, l'index est retrouvé en
 * masquant les URL de la configuration et en comparant. Si la liste a changé
 * et que l'URL n'existe plus, l'épingle est simplement ignorée.
 *
 * Le registre des chaînes est chargé à la demande (`require` différé) : ce
 * module est importé très tôt (index.js), avant le routeur.
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { stripUrlSecrets } from './sanitizeLog';
import { isDecoySession } from './sessionMode';
import { setRpcPin } from '../src/domain/chains/net';

const STORE_KEY = 'kalyx.rpcOverrides.v1';

/** URL affichable : identifiants, paramètres, fragment et segments opaques (clés d'API) retirés. */
export function displayRpcUrl(url: string): string {
  if (!url) return '';
  return stripUrlSecrets(url)
    .replace(/\/(v\d+)\/[A-Za-z0-9_-]{16,}/g, '/$1/[…]')
    .replace(/^(https?:\/\/)[A-Za-z0-9_-]{20,}\./i, '$1[…].');
}

/** Familles dont l'ordre d'essai passe par `tryInOrder` (clé de santé). */
const HEALTH_PREFIX: Record<string, string> = { evm: 'evm', solana: 'sol', bitcoin: 'btc' };

/** Clé de santé d'une chaîne (identique à celle des adaptateurs), ou null si la famille n'en a pas. */
export function healthKeyOf(chain: { id: string; family: string }): string | null {
  const p = HEALTH_PREFIX[chain.family];
  return p ? `${p}:${chain.id}` : null;
}

/** Index de l'URL épinglée (forme masquée) dans la liste actuelle, ou null. */
export function resolvePinIndex(rpcUrls: readonly string[], maskedPin: string): number | null {
  const i = rpcUrls.findIndex((u) => displayRpcUrl(u) === maskedPin);
  return i >= 0 ? i : null;
}

/* ------------------------------------------------------------------ */
/* Bascule Mainnet ↔ Testnets                                          */
/* ------------------------------------------------------------------ */

/** Correspondance mainnet → testnet équivalent. */
export const TESTNET_OF: Readonly<Record<string, string>> = {
  ethereum: 'sepolia',
  base: 'base-sepolia',
  solana: 'solana-devnet',
  ton: 'ton-testnet',
  monad: 'monad-testnet',
};
/** Réciproque testnet → mainnet. */
export const MAINNET_OF: Readonly<Record<string, string>> = Object.fromEntries(Object.entries(TESTNET_OF).map(([m, t]) => [t, m]));

/**
 * Réseau à activer après la bascule. Équivalent si la table le connaît ET que
 * la chaîne existe ; sinon repli : `fallbackMainnet` (DEFAULT_CHAIN) ou
 * `fallbackTestnet` (Sepolia). Le réseau courant est gardé s'il est déjà du
 * bon côté.
 */
export function counterpartChain(
  current: string,
  toTestnet: boolean,
  opts: { exists: (id: string) => boolean; isTestnet: (id: string) => boolean; fallbackMainnet: string; fallbackTestnet: string },
): string {
  if (opts.exists(current) && opts.isTestnet(current) === toTestnet) return current;
  const mapped = toTestnet ? TESTNET_OF[current] : MAINNET_OF[current];
  if (mapped && opts.exists(mapped)) return mapped;
  const fb = toTestnet ? opts.fallbackTestnet : opts.fallbackMainnet;
  return opts.exists(fb) ? fb : opts.fallbackMainnet;
}

/* ------------------------------------------------------------------ */
/* Magasin                                                             */
/* ------------------------------------------------------------------ */

interface RpcOverridesState {
  loaded: boolean;
  /** id de chaîne → URL épinglée, sous forme MASQUÉE. */
  pins: Record<string, string>;
  load: () => Promise<void>;
  pin: (chainId: string, url: string) => void;
  unpin: (chainId: string) => void;
}

type ChainLike = { id: string; family: string; rpcUrls: string[] };

function findChain(id: string): ChainLike | null {
  try {
    const reg = require('../src/domain/chains/registry') as typeof import('../src/domain/chains/registry');
    return reg.hasChain(id) ? (reg.getAdapter(id).config as ChainLike) : null;
  } catch {
    return null;
  }
}

/** Pose les épingles dans net.ts (index retrouvés). Exportée pour les tests. */
export function applyPins(pins: Record<string, string>, lookup: (id: string) => ChainLike | null = findChain, previous: Record<string, string> = {}): void {
  for (const id of Object.keys(previous)) {
    if (pins[id]) continue;
    const c = lookup(id);
    const key = c ? healthKeyOf(c) : null;
    if (key) setRpcPin(key, null);
  }
  for (const [id, masked] of Object.entries(pins)) {
    const c = lookup(id);
    const key = c ? healthKeyOf(c) : null;
    if (!c || !key) continue;
    setRpcPin(key, resolvePinIndex(c.rpcUrls, masked));
  }
}

function save(pins: Record<string, string>): void {
  if (isDecoySession()) return; // session leurre : rien n'est écrit
  AsyncStorage.setItem(STORE_KEY, JSON.stringify(pins)).catch(() => {});
}

export const useRpcOverrides = create<RpcOverridesState>((set, get) => ({
  loaded: false,
  pins: {},
  load: async () => {
    let pins: Record<string, string> = {};
    try {
      const raw = await AsyncStorage.getItem(STORE_KEY);
      const parsed = raw ? (JSON.parse(raw) as unknown) : null;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          // Revalidé : seule une forme masquée est acceptée (jamais une URL brute relue).
          if (typeof v === 'string' && v && displayRpcUrl(v) === v) pins[k] = v;
        }
      }
    } catch {
      pins = {};
    }
    // Épingles posées pendant le chargement : gardées par-dessus le disque.
    const merged = { ...pins, ...get().pins };
    set({ loaded: true, pins: merged });
    applyPins(merged);
  },
  pin: (chainId, url) => {
    const prev = get().pins;
    const pins = { ...prev, [chainId]: displayRpcUrl(url) };
    set({ pins });
    applyPins(pins, findChain, prev);
    save(pins);
  },
  unpin: (chainId) => {
    const prev = get().pins;
    const pins = { ...prev };
    delete pins[chainId];
    set({ pins });
    applyPins(pins, findChain, prev);
    save(pins);
  },
}));

/** Chargement au démarrage (index.js) : jamais bloquant, jamais fatal. */
export function loadRpcOverrides(): void {
  void useRpcOverrides.getState().load().catch(() => {});
}
