import { create } from 'zustand';
import { maskSecretsOnly } from './secretDetector';
import { knownTxHashes } from './knownTxHashes';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isDecoySession, onDecoyChange } from './sessionMode';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: number;
  /**
   * Action PROPOSÉE avec la réponse, rendue en bouton. Elle n'est jamais jouée
   * d'elle-même : l'assistant suggère, l'utilisateur décide (cf. lib/aiActions).
   */
  action?: { label: string; route: string; params: Record<string, string> };
}

export interface ChatSession {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
}

interface AiChatHistoryState {
  sessions: ChatSession[];
  activeSessionId: string | null;
  createNewSession: () => string;
  setActiveSession: (id: string) => void;
  addMessageToActive: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  deleteSession: (id: string) => void;
}

/** Sortie de la session leurre : la prochaine relecture ne garde rien de la mémoire. */
let dropChatMemoryOnHydrate = false;

export const useAiChatHistoryStore = create<AiChatHistoryState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,

      createNewSession: () => {
        const newId = Date.now().toString();
        const newSession: ChatSession = {
          id: newId,
          title: 'Nouvelle discussion',
          updatedAt: Date.now(),
          messages: [],
        };
        set((state) => ({
          sessions: [newSession, ...state.sessions],
          activeSessionId: newId,
        }));
        return newId;
      },

      setActiveSession: (id) => set({ activeSessionId: id }),

      addMessageToActive: (msg) => {
        const { activeSessionId, sessions, createNewSession } = get();
        const currentId = activeSessionId || createNewSession();

        const fullMsg: ChatMessage = {
          ...msg,
          // Jamais de secret en clair dans l'historique persistant, quel que soit l'écran appelant.
          text: maskSecretsOnly(msg.text, knownTxHashes()),
          id: Math.random().toString(36).substring(7),
          timestamp: Date.now(),
        };

        set((state) => ({
          sessions: state.sessions.map((s) => {
            if (s.id !== currentId) return s;
            const updatedMessages = [...s.messages, fullMsg];
            // Si c'est le premier message de l'utilisateur, on génère le titre
            const title =
              s.messages.length === 0 && msg.sender === 'user'
                ? fullMsg.text.slice(0, 30) + (fullMsg.text.length > 30 ? '...' : '')
                : s.title;

            return {
              ...s,
              title,
              updatedAt: Date.now(),
              messages: updatedMessages,
            };
          }),
        }));
      },

      deleteSession: (id) =>
        set((state) => ({
          sessions: state.sessions.filter((s) => s.id !== id),
          activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
        })),
    }),
    {
      name: 'kalyx-ai-chat-history',
      // Session leurre : lectures vides, écritures ignorées (les vraies conversations restent intactes).
      storage: createJSONStorage(() => ({
        getItem: (k: string) => (isDecoySession() ? Promise.resolve(null) : AsyncStorage.getItem(k)),
        setItem: (k: string, v: string) => (isDecoySession() ? Promise.resolve() : AsyncStorage.setItem(k, v)),
        removeItem: (k: string) => (isDecoySession() ? Promise.resolve() : AsyncStorage.removeItem(k)),
      })),
      merge: (persisted, current) => {
        const stored = persisted as Partial<Pick<AiChatHistoryState, 'sessions' | 'activeSessionId'>> | undefined;
        const drop = dropChatMemoryOnHydrate;
        dropChatMemoryOnHydrate = false;
        if (stored) return { ...current, ...stored };
        return drop ? { ...current, sessions: [], activeSessionId: null } : current;
      },
    }
  )
);

onDecoyChange((on) => {
  if (on) {
    useAiChatHistoryStore.setState({ sessions: [], activeSessionId: null }); // écriture neutralisée en leurre
    return;
  }
  // Sortie : la relecture remplace la mémoire (discussions du leurre comprises), sans rien écrire.
  dropChatMemoryOnHydrate = true;
  void useAiChatHistoryStore.persist.rehydrate();
});
