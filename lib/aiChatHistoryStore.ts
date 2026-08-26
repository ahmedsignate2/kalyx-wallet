import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: number;
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
                ? msg.text.slice(0, 30) + (msg.text.length > 30 ? '...' : '')
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
      name: 'nova-ai-chat-history',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
