/**
 * Préférences d'affichage des tokens : MASQUÉS et ÉPINGLÉS, par (réseau, contrat).
 * Persistées localement (non sensible). `showHidden` est transitoire (session) :
 * un interrupteur pour révéler temporairement les tokens masqués.
 */
import { create } from 'zustand';
import { saveTokenPrefs, loadTokenPrefs } from './secureStore';

/** Clé stable d'un token : `${chainId}:${contract en minuscules}`. */
export function tokenKey(chainId: string, contract: string): string {
  return `${chainId}:${contract.toLowerCase()}`;
}

interface Persisted {
  hidden: Record<string, boolean>;
  pinned: Record<string, boolean>;
}

interface TokenPrefsState extends Persisted {
  showHidden: boolean;
  load: () => Promise<void>;
  toggleHidden: (key: string) => void;
  togglePin: (key: string) => void;
  setShowHidden: (v: boolean) => void;
}

export const useTokenPrefs = create<TokenPrefsState>((set, get) => ({
  hidden: {},
  pinned: {},
  showHidden: false,

  load: async () => {
    const p = await loadTokenPrefs<Persisted>({ hidden: {}, pinned: {} });
    set({ hidden: p.hidden ?? {}, pinned: p.pinned ?? {} });
  },

  toggleHidden: (key) => {
    const hidden = { ...get().hidden };
    if (hidden[key]) delete hidden[key];
    else hidden[key] = true;
    // Un token masqué ne peut pas rester épinglé.
    const pinned = { ...get().pinned };
    if (hidden[key]) delete pinned[key];
    set({ hidden, pinned });
    void saveTokenPrefs({ hidden, pinned });
  },

  togglePin: (key) => {
    const pinned = { ...get().pinned };
    if (pinned[key]) delete pinned[key];
    else pinned[key] = true;
    set({ pinned });
    void saveTokenPrefs({ hidden: get().hidden, pinned });
  },

  setShowHidden: (v) => set({ showHidden: v }),
}));
