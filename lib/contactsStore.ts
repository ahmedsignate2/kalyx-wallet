/**
 * Carnet d'adresses (local, non sensible). Adresses publiques uniquement.
 */
import { create } from 'zustand';
import { saveContacts, loadContactsRaw } from './secureStore';
import { isDecoySession, onDecoyChange } from './sessionMode';

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
    if (isDecoySession()) return set({ contacts: [] });
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
    if (!isDecoySession()) void saveContacts(contacts); // session leurre : jamais par-dessus les vrais contacts
  },

  update: (id, name, address) => {
    const contacts = get()
      .contacts.map((c) => (c.id === id ? { ...c, name: name.trim(), address: address.trim() } : c))
      .sort((a, b) => a.name.localeCompare(b.name));
    set({ contacts });
    if (!isDecoySession()) void saveContacts(contacts);
  },

  remove: (id) => {
    const contacts = get().contacts.filter((c) => c.id !== id);
    set({ contacts });
    if (!isDecoySession()) void saveContacts(contacts);
  },
}));

// Session leurre : les vrais contacts disparaissent ; à la sortie, ils reviennent.
onDecoyChange((on) => {
  if (on) useContacts.setState({ contacts: [] });
  else void useContacts.getState().load();
});
