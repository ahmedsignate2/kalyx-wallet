import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface StoredTicket {
  id: string; // Format KX-YYYYMMDD-XXXXX
  createdAt: number; // Timestamp (ms)
  problem: string;
  network?: string;
  detectedError?: string;
  content: string; // Contenu complet du ticket avec logs condensés
}

export interface TicketHistoryState {
  tickets: StoredTicket[];
  addTicket: (ticketInput: Partial<StoredTicket> & { content: string }) => StoredTicket;
  removeTicket: (id: string) => void;
  clearTickets: () => void;
}

/**
 * Analyse le texte brut ou normalisé d'un ticket pour en extraire les champs structurés.
 */
export function parseTicketContent(
  content: string,
  fallbackNetwork?: string
): Omit<StoredTicket, 'createdAt'> & { createdAt?: number } {
  const idMatch = content.match(/• ID\s*:\s*([^\r\n]+)/i);
  const problemMatch = content.match(/• Problème\s*:\s*([^\r\n]+)/i);
  const networkMatch = content.match(/• Réseau\s*:\s*([^\r\n]+)/i);
  const errMatch = content.match(/• Erreur détectée\s*:\s*([^\r\n]+)/i);

  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const rand = Math.floor(10000 + Math.random() * 90000);
  const fallbackId = `KX-${yyyy}${mm}${dd}-${rand}`;

  const id = idMatch ? idMatch[1].trim() : fallbackId;
  const problem = problemMatch ? problemMatch[1].trim() : 'Demande d\'assistance';
  const network = (networkMatch ? networkMatch[1].trim() : fallbackNetwork) || undefined;
  const detectedError = errMatch ? errMatch[1].trim() : undefined;

  return {
    id,
    problem,
    network,
    detectedError,
    content,
  };
}

const inMemoryStorage = new Map<string, string>();

export const safeAsyncStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      if (typeof window !== 'undefined' && window?.localStorage) {
        return window.localStorage.getItem(key);
      }
      if (AsyncStorage?.getItem) {
        const val = await AsyncStorage.getItem(key);
        if (val !== null) return val;
      }
    } catch {}
    return inMemoryStorage.get(key) ?? null;
  },
  setItem: async (key: string, value: string): Promise<void> => {
    inMemoryStorage.set(key, value);
    try {
      if (typeof window !== 'undefined' && window?.localStorage) {
        window.localStorage.setItem(key, value);
        return;
      }
      if (AsyncStorage?.setItem) {
        await AsyncStorage.setItem(key, value);
      }
    } catch {}
  },
  removeItem: async (key: string): Promise<void> => {
    inMemoryStorage.delete(key);
    try {
      if (typeof window !== 'undefined' && window?.localStorage) {
        window.localStorage.removeItem(key);
        return;
      }
      if (AsyncStorage?.removeItem) {
        await AsyncStorage.removeItem(key);
      }
    } catch {}
  },
};

export const useTicketHistoryStore = create<TicketHistoryState>()(
  persist(
    (set, get) => ({
      tickets: [],

      addTicket: (ticketInput) => {
        const parsed = parseTicketContent(ticketInput.content, ticketInput.network);
        const id = ticketInput.id || parsed.id;
        const problem = ticketInput.problem || parsed.problem;
        const network = ticketInput.network || parsed.network;
        const detectedError = ticketInput.detectedError || parsed.detectedError;
        const createdAt = ticketInput.createdAt || Date.now();
        const content = ticketInput.content;

        const newTicket: StoredTicket = {
          id,
          createdAt,
          problem,
          network,
          detectedError,
          content,
        };

        set((state) => {
          // Filtrer tout ticket existant avec le même ID
          const filtered = state.tickets.filter((t) => t.id !== id);
          // Ajouter en tête et limiter aux 50 derniers tickets
          const updated = [newTicket, ...filtered].slice(0, 50);
          return { tickets: updated };
        });

        return newTicket;
      },

      removeTicket: (id) => {
        set((state) => ({
          tickets: state.tickets.filter((t) => t.id !== id),
        }));
      },

      clearTickets: () => {
        set({ tickets: [] });
      },
    }),
    {
      name: 'nova-support-tickets',
      storage: createJSONStorage(() => safeAsyncStorage),
    }
  )
);
