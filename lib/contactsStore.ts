/**
 * Carnet d'adresses (local, non sensible). Adresses publiques uniquement.
 */
import { create } from 'zustand';
import { saveContacts, loadContactsRaw } from './secureStore';

export interface Contact {
  id: string;
  name: string;
  address: string;
}

interface ContactsState {
  contacts: Contact[];
  load: () => Promise<void>;
  add: (name: string, address: string) => void;
  update: (id: string, name: string, address: string) => void;
  remove: (id: string) => void;
}

export const useContacts = create<ContactsState>((set, get) => ({
  contacts: [],

  load: async () => {
    const raw = await loadContactsRaw();
    if (!raw) return;
    try {
      set({ contacts: JSON.parse(raw) as Contact[] });
    } catch {
      /* ignore */
    }
  },

  add: (name, address) => {
    const c: Contact = { id: `c${Date.now().toString(36)}`, name: name.trim(), address: address.trim() };
    const contacts = [...get().contacts, c].sort((a, b) => a.name.localeCompare(b.name));
    set({ contacts });
    void saveContacts(contacts);
  },

  update: (id, name, address) => {
    const contacts = get()
      .contacts.map((c) => (c.id === id ? { ...c, name: name.trim(), address: address.trim() } : c))
      .sort((a, b) => a.name.localeCompare(b.name));
    set({ contacts });
    void saveContacts(contacts);
  },

  remove: (id) => {
    const contacts = get().contacts.filter((c) => c.id !== id);
    set({ contacts });
    void saveContacts(contacts);
  },
}));
