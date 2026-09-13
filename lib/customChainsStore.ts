/**
 * Réseaux EVM personnalisés (mode développeur) : l'utilisateur ajoute un RPC
 * custom (chainId, symbole, explorateur). Persistés et enregistrés dans le
 * registre de chaînes au boot, pour apparaître partout comme un réseau normal.
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerChain, unregisterChain, serializeNetworks, parseNetworksBackup, type ChainConfig } from '../src';
import { useWallet, DEFAULT_CHAIN } from './walletStore';

const KEY = 'nova.customChains';

export interface CustomChainInput {
  name: string;
  evmChainId: number;
  nativeSymbol: string;
  rpcUrl: string;
  explorerUrl?: string;
  testnet?: boolean;
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
    testnet: input.testnet === true,
    // Pas de prix/tokens (pas de plateforme CoinGecko connue).
  };
}

interface CustomChainsState {
  chains: ChainConfig[];
  load: () => Promise<void>;
  add: (input: CustomChainInput) => { ok: boolean; error?: string };
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
    const toAdd = incoming.filter((c) => !existing.has(c.id));
    toAdd.forEach((c) => registerChain(c)); // actifs immédiatement dans le registre
    const chains = [...get().chains, ...toAdd];
    set({ chains });
    persist(chains);
    return { ok: true, added: toAdd.length, skipped: incoming.length - toAdd.length };
  },
}));
