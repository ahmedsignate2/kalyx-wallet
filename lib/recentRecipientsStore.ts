/**
 * Destinataires récents (par famille de réseau). Persistés localement. Alimenté
 * après chaque envoi réussi, proposé en accès rapide sur l'écran d'envoi. Ce sont
 * des adresses PUBLIQUES, aucune donnée sensible.
 */
import { create } from 'zustand';
import { saveRecentRecipients, loadRecentRecipients } from './secureStore';

export type RecipientFamily = 'evm' | 'bitcoin' | 'solana';

export interface RecentRecipient {
  address: string;
  family: RecipientFamily;
  ts: number;
}

const MAX = 12; // on garde les 12 plus récents

interface RecentsState {
  recents: RecentRecipient[];
  load: () => Promise<void>;
  add: (address: string, family: RecipientFamily) => void;
  forFamily: (family: RecipientFamily) => RecentRecipient[];
}

export const useRecentRecipients = create<RecentsState>((set, get) => ({
  recents: [],

  load: async () => {
    set({ recents: await loadRecentRecipients<RecentRecipient>() });
  },

  add: (address, family) => {
    const addr = address.trim();
    if (!addr) return;
    // Dédupe (insensible à la casse), remet en tête, plafonne.
    const rest = get().recents.filter((r) => r.address.toLowerCase() !== addr.toLowerCase());
    const recents = [{ address: addr, family, ts: Date.now() }, ...rest].slice(0, MAX);
    set({ recents });
    void saveRecentRecipients(recents);
  },

  forFamily: (family) => get().recents.filter((r) => r.family === family),
}));
