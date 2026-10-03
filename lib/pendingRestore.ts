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
import type { BackupAccount, BackupWallet } from '../src/domain/backup/cloudBackup';

/**
 * `primaryAccounts` : comptes du portefeuille principal (celui du code créé),
 * recréés par `set-pin` juste après — sans quoi seul le compte n°1 revenait.
 */
export const usePendingRestore = create<{
  wallets: BackupWallet[];
  primaryAccounts: BackupAccount[];
  set: (w: BackupWallet[], primaryAccounts?: BackupAccount[]) => void;
  clear: () => void;
}>((set) => ({
  wallets: [],
  primaryAccounts: [],
  set: (wallets, primaryAccounts = []) => set({ wallets, primaryAccounts }),
  clear: () => set({ wallets: [], primaryAccounts: [] }),
}));
