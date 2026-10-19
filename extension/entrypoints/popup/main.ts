/**
 * POPUP : « Commencer » sans coffre, mot de passe si verrouillé, sinon le
 * portefeuille (ui/wallet, partagé avec le panneau latéral).
 */
import { mountWallet } from '../../ui/wallet';
import { lockedScreen, noVaultScreen } from '../../ui/screens';

const app = document.getElementById('app')!;
const wallet = mountWallet(app, {
  mode: 'popup',
  onNoVault: (hasVault) => noVaultScreen(app, true, hasVault),
  onLocked: () => lockedScreen(app, () => void wallet.load()),
});
void wallet.load(true);
