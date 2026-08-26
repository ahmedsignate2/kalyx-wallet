import { create } from 'zustand';

interface BrowserState {
  currentUrl: string;
  currentTitle: string;
  setBrowserContext: (ctx: { currentUrl: string; currentTitle?: string }) => void;
}

export const useBrowserStore = create<BrowserState>((set) => ({
  currentUrl: '',
  currentTitle: '',
  setBrowserContext: (ctx) => set((state) => ({ ...state, ...ctx })),
}));
