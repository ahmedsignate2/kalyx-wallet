/**
 * Tokens ajoutés manuellement par l'utilisateur (par contrat, par chaîne).
 * Données publiques (adresses de contrat), persistées localement.
 */
import { create } from 'zustand';
import { saveCustomTokens, loadCustomTokens } from './secureStore';

interface CustomTokensState {
  byChain: Record<string, string[]>;
  load: () => Promise<void>;
  add: (chainId: string, contract: string) => void;
  remove: (chainId: string, contract: string) => void;
  list: (chainId: string) => string[];
}

export const useCustomTokens = create<CustomTokensState>((set, get) => ({
  byChain: {},

  load: async () => {
    set({ byChain: await loadCustomTokens() });
  },

  add: (chainId, contract) => {
    const c = contract.trim();
    const current = get().byChain[chainId] ?? [];
    if (current.some((x) => x.toLowerCase() === c.toLowerCase())) return;
    const byChain = { ...get().byChain, [chainId]: [...current, c] };
    set({ byChain });
    void saveCustomTokens(byChain);
  },

  remove: (chainId, contract) => {
    const current = get().byChain[chainId] ?? [];
    const byChain = { ...get().byChain, [chainId]: current.filter((x) => x.toLowerCase() !== contract.toLowerCase()) };
    set({ byChain });
    void saveCustomTokens(byChain);
  },

  list: (chainId) => get().byChain[chainId] ?? [],
}));
