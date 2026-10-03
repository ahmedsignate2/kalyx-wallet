/**
 * « L'app est-elle verrouillée ? » — UNE seule définition pour tout ce qui
 * s'affiche hors des écrans : rideau global, fenêtres WalletConnect et TON
 * Connect, assistant IA.
 *
 * `lock()` ne vide pas la mémoire : le compte, les adresses et les soldes y
 * restent, et `account` reste défini. Tester `!!account` (ce que faisait TON
 * Connect) laissait donc ses fenêtres s'ouvrir par-dessus l'écran de code.
 * Seul `isUnlocked` dit la vérité.
 */
import { useWallet } from './walletStore';

export function useLocked(): boolean {
  return useWallet((s) => s.ready && s.hasWallet && !s.isUnlocked);
}
