/**
 * Réseaux EVM personnalisés (mode développeur) : l'utilisateur ajoute un RPC
 * custom (chainId, symbole, explorateur). Persistés et enregistrés dans le
 * registre de chaînes au boot, pour apparaître partout comme un réseau normal.
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerChain, unregisterChain, type ChainConfig } from '../src';

const KEY = 'nova.customChains';

export interface CustomChainInput {
  name: string;
  evmChainId: number;
  nativeSymbol: string;
  rpcUrl: string;
  explorerUrl?: string;
}

/** Construit une ChainConfig EVM à partir de la saisie utilisateur. */
export function buildCustomChain(input: CustomChainInput): ChainConfig {
  return {
    id: `custom-${input.evmChainId}`,
    name: input.name.trim(),
    family: 'evm',
    evmChainId: input.evmChainId,
    nativeSymbol: input.nativeSymbol.trim().toUpperCase(),
    nativeDecimals: 18,
    rpcUrls: [input.rpcUrl.trim()],
    explorerUrl: input.explorerUrl?.trim() || undefined,
    // Pas de prix/tokens (pas de plateforme CoinGecko connue).
  };
}

interface CustomChainsState {
  chains: ChainConfig[];
  load: () => Promise<void>;
  add: (input: CustomChainInput) => { ok: boolean; error?: string };
  remove: (id: string) => void;
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
    if (!input.name.trim() || !input.nativeSymbol.trim()) return { ok: false, error: 'Nom et symbole requis.' };
    if (!Number.isInteger(input.evmChainId) || input.evmChainId <= 0) return { ok: false, error: 'Chain ID invalide.' };
    if (!/^https:\/\//i.test(input.rpcUrl.trim())) return { ok: false, error: 'RPC : URL https requise.' };
    const config = buildCustomChain(input);
    if (get().chains.some((c) => c.id === config.id)) return { ok: false, error: 'Ce Chain ID existe déjà.' };
    registerChain(config);
    const chains = [...get().chains, config];
    set({ chains });
    persist(chains);
    return { ok: true };
  },

  remove: (id) => {
    unregisterChain(id);
    const chains = get().chains.filter((c) => c.id !== id);
    set({ chains });
    persist(chains);
  },
}));
