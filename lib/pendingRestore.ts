/**
 * Portefeuilles SUPPLÉMENTAIRES d'une sauvegarde restaurée au premier lancement.
 *
 * L'installation ne sait créer qu'UN portefeuille (celui dont on crée le code).
 * Les autres étaient gardés dans l'état local de l'écran de restauration, que
 * rien ne relisait après la création du code : ils étaient perdus en silence —
 * et, pire, la fenêtre « code pour importer » de cet écran resté monté surgissait
 * par-dessus la création du code. Ils attendent ici, en mémoire seulement, et
 * `set-pin` les ajoute avec le code tout juste créé.
 */
import { create } from 'zustand';
import type { BackupWallet } from '../src/domain/backup/cloudBackup';

export const usePendingRestore = create<{ wallets: BackupWallet[]; set: (w: BackupWallet[]) => void; clear: () => void }>((set) => ({
  wallets: [],
  set: (wallets) => set({ wallets }),
  clear: () => set({ wallets: [] }),
}));
