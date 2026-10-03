/**
 * Réseaux personnalisés : l'utilisateur ajoute son propre RPC (EVM, Bitcoin ou
 * Solana). Persistés et enregistrés dans le registre de chaînes au boot, pour
 * apparaître partout comme un réseau normal.
 *
 * Les trois familles, pas seulement l'EVM : sur Solana l'endpoint public est le
 * goulot d'étranglement, et pouvoir y mettre le sien change tout — c'est même le
 * cas d'usage principal. Le registre savait déjà fabriquer les trois adapters.
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  registerChain,
  listChains,
  unregisterChain,
  serializeNetworks,
  parseNetworksBackup,
  customChainId,
  DEFAULT_DECIMALS,
  type ChainConfig,
  type ChainFamily,
} from '../src';
import { useWallet, DEFAULT_CHAIN } from './walletStore';

const KEY = 'nova.customChains';

export interface CustomChainInput {
  name: string;
  /** Par défaut `evm` : les appelants d'avant l'ouverture aux autres familles. */
  family?: ChainFamily;
  /** Requis pour l'EVM uniquement — hors EVM, la notion n'existe pas. */
  evmChainId: number;
  nativeSymbol: string;
  /** Décimales de la pièce native ; défaut selon la famille. */
  nativeDecimals?: number;
  rpcUrl: string;
  explorerUrl?: string;
  testnet?: boolean;
}

/** Construit une ChainConfig à partir de la saisie utilisateur. */
export function buildCustomChain(input: CustomChainInput): ChainConfig {
  const family = input.family ?? 'evm';
  const name = input.name.trim();
  const evmChainId = family === 'evm' ? input.evmChainId : undefined;
  return {
    id: customChainId(family, evmChainId, name),
    name,
    family,
    ...(evmChainId !== undefined ? { evmChainId } : {}),
    nativeSymbol: input.nativeSymbol.trim().toUpperCase(),
    nativeDecimals:
      Number.isInteger(input.nativeDecimals) &&
      (input.nativeDecimals as number) >= 0 &&
      (input.nativeDecimals as number) <= 36
        ? (input.nativeDecimals as number)
        : DEFAULT_DECIMALS[family],
    rpcUrls: [input.rpcUrl.trim()],
    explorerUrl: input.explorerUrl?.trim() || undefined,
    testnet: input.testnet === true,
    // Pas de prix/tokens (pas de plateforme CoinGecko connue).
  };
}

interface CustomChainsState {
  chains: ChainConfig[];
  load: () => Promise<void>;
  /** `error` est une CLÉ de traduction ; `detail` complète `netErrBuiltin`. */
  add: (input: CustomChainInput) => { ok: boolean; error?: string; detail?: string };
  remove: (id: string) => void;
  /** Sérialise les réseaux perso pour sauvegarde (partage/fichier). */
  exportBackup: () => string;
  /** Restaure des réseaux depuis une sauvegarde ; dédupe avec l'existant. */
  importBackup: (text: string) => { ok: boolean; added: number; skipped: number; error?: string };
}

function persist(chains: ChainConfig[]) {
  void AsyncStorage.setItem(KEY, JSON.stringify(chains)).catch(() => {});
}

export const useCustomChains = create<CustomChainsState>((set, get) => ({
  chains: [],

  load: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const chains = raw ? (JSON.parse(raw) as ChainConfig[]) : [];
      chains.forEach((c) => registerChain(c)); // rend actives dans le registre
      set({ chains });
    } catch {
      /* silencieux */
    }
  },

  add: (input) => {
    const family = input.family ?? 'evm';
    if (!input.name.trim() || !input.nativeSymbol.trim()) return { ok: false, error: 'netErrNameSymbol' };
    // Le Chain ID n'est exigé que pour l'EVM : hors EVM, l'identité vient du nom.
    if (family === 'evm' && (!Number.isInteger(input.evmChainId) || input.evmChainId <= 0)) {
      return { ok: false, error: 'netErrChainId' };
    }
    // Un réseau INTÉGRÉ porte déjà ce Chain ID : un doublon « perso » pourrait l'imiter (faux soldes, autre RPC).
    const builtin = family === 'evm' ? listChains({ includeTestnets: true }).find((c) => c.evmChainId === input.evmChainId && !c.id.startsWith('custom-')) : undefined;
    if (builtin) return { ok: false, error: 'netErrBuiltin', detail: builtin.name };
    if (!/^https:\/\//i.test(input.rpcUrl.trim())) return { ok: false, error: 'netErrHttps' };
    if (
      input.nativeDecimals !== undefined &&
      (!Number.isInteger(input.nativeDecimals) || input.nativeDecimals < 0 || input.nativeDecimals > 36)
    ) {
      return { ok: false, error: 'netErrDecimals' };
    }
    const config = buildCustomChain(input);
    if (get().chains.some((c) => c.id === config.id)) {
      return { ok: false, error: 'netErrExists' };
    }
    registerChain(config);
    const chains = [...get().chains, config];
    set({ chains });
    persist(chains);
    return { ok: true };
  },

  remove: (id) => {
    // Si on retire le réseau ACTIF, basculer AVANT sur un réseau sûr : sinon
    // getAdapter(activeChain) lèverait « Chaîne inconnue » partout (crash en boucle).
    const w = useWallet.getState();
    if (w.activeChain === id) w.setActiveChain(DEFAULT_CHAIN);
    unregisterChain(id);
    const chains = get().chains.filter((c) => c.id !== id);
    set({ chains });
    persist(chains);
  },

  exportBackup: () => serializeNetworks(get().chains),

  importBackup: (text) => {
    const { chains: incoming, error } = parseNetworksBackup(text);
    if (error) return { ok: false, added: 0, skipped: 0, error };
    const existing = new Set(get().chains.map((c) => c.id));
    // Jamais un doublon d'un réseau intégré, même depuis une sauvegarde.
    const builtinIds = new Set(listChains({ includeTestnets: true }).filter((c) => !c.id.startsWith('custom-') && c.evmChainId).map((c) => c.evmChainId));
    const toAdd = incoming.filter((c) => !existing.has(c.id) && !(c.family === 'evm' && builtinIds.has(c.evmChainId)));
    toAdd.forEach((c) => registerChain(c)); // actifs immédiatement dans le registre
    const chains = [...get().chains, ...toAdd];
    set({ chains });
    persist(chains);
    return { ok: true, added: toAdd.length, skipped: incoming.length - toAdd.length };
  },
}));
