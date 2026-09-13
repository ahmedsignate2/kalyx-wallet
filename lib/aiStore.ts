import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { copilotLog } from './copilotLogger';

export type AiProvider = 'deepseek' | 'openai' | 'anthropic' | 'gemini' | 'groq' | 'openrouter' | 'together' | 'huggingface' | 'custom';
export type CopilotStatus = 'idle' | 'thinking' | 'searching_web' | 'analyzing_sources' | 'generating';

interface AiState {
  isEnabled: boolean;
  isOpen: boolean;
  initialPrompt: string | null;
  openChat: (prompt?: string) => void;
  closeChat: () => void;
  provider: AiProvider;
  apiKey: string | null;
  customUrl?: string;
  customModel?: string;
  copilotStatus: CopilotStatus;
  currentSearchQuery: string | null;
  setCopilotStatus: (status: CopilotStatus, query?: string | null) => void;
  
  loadInitialState: () => Promise<void>;
  setApiKey: (key: string, provider: AiProvider, customUrl?: string, customModel?: string) => Promise<void>;
  disableAi: () => Promise<void>;
}

export const useAiStore = create<AiState>((set) => ({
  isEnabled: false,
  isOpen: false,
  initialPrompt: null,
  provider: 'deepseek',
  apiKey: null,
  copilotStatus: 'idle',
  currentSearchQuery: null,
  setCopilotStatus: (copilotStatus, currentSearchQuery = null) => {
    copilotLog('store', 'status.changed', { status: copilotStatus, searchQuery: currentSearchQuery });
    set({ copilotStatus, currentSearchQuery });
  },


  openChat: (prompt) => set({ isOpen: true, initialPrompt: prompt || null }),
  closeChat: () => set({ isOpen: false, initialPrompt: null }),

  loadInitialState: async () => {
    try {
      const storedKey = await SecureStore.getItemAsync('ai_api_key');
      const storedProvider = (await SecureStore.getItemAsync('ai_provider')) as AiProvider | null;
      const customUrl = await SecureStore.getItemAsync('ai_custom_url');
      const customModel = await SecureStore.getItemAsync('ai_custom_model');
      if (storedKey) {
        set({ isEnabled: true, apiKey: storedKey, provider: storedProvider ?? 'deepseek', customUrl: customUrl || undefined, customModel: customModel || undefined });
      }
    } catch (e) {
      console.warn('Failed to load AI state', e);
    }
  },

  setApiKey: async (key, provider, customUrl, customModel) => {
    await SecureStore.setItemAsync('ai_api_key', key);
    await SecureStore.setItemAsync('ai_provider', provider);
    if (customUrl) await SecureStore.setItemAsync('ai_custom_url', customUrl); else await SecureStore.deleteItemAsync('ai_custom_url');
    if (customModel) await SecureStore.setItemAsync('ai_custom_model', customModel); else await SecureStore.deleteItemAsync('ai_custom_model');
    set({ apiKey: key, provider, customUrl, customModel, isEnabled: true });
  },

  disableAi: async () => {
    await SecureStore.deleteItemAsync('ai_api_key');
    await SecureStore.deleteItemAsync('ai_provider');
    set({ apiKey: null, isEnabled: false });
  },
}));
