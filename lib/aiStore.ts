import { create } from 'zustand';
import { kvGet, kvSet, kvDel } from './kv';
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
      const storedKey = await kvGet('ai_api_key');
      const storedProvider = (await kvGet('ai_provider')) as AiProvider | null;
      const customUrl = await kvGet('ai_custom_url');
      const customModel = await kvGet('ai_custom_model');
      if (storedKey) {
        set({ isEnabled: true, apiKey: storedKey, provider: storedProvider ?? 'deepseek', customUrl: customUrl || undefined, customModel: customModel || undefined });
      }
    } catch (e) {
      console.warn('Failed to load AI state', e);
    }
  },

  setApiKey: async (key, provider, customUrl, customModel) => {
    await kvSet('ai_api_key', key);
    await kvSet('ai_provider', provider);
    if (customUrl) await kvSet('ai_custom_url', customUrl); else await kvDel('ai_custom_url');
    if (customModel) await kvSet('ai_custom_model', customModel); else await kvDel('ai_custom_model');
    set({ apiKey: key, provider, customUrl, customModel, isEnabled: true });
  },

  disableAi: async () => {
    await kvDel('ai_api_key');
    await kvDel('ai_provider');
    set({ apiKey: null, isEnabled: false });
  },
}));
