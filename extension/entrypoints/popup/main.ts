/**
 * POPUP : « Commencer » sans coffre, mot de passe si verrouillé, sinon le
 * portefeuille (ui/wallet, partagé avec le panneau latéral).
 */
import { installFeedback } from '../../ui/feedback';
import { mountScene } from '../../ui/landscape';
import { applyLang } from '../../ui/i18n';
import { mountWallet } from '../../ui/wallet';
import { lockedScreen, noVaultScreen } from '../../ui/screens';

applyLang();
installFeedback();
mountScene();
const app = document.getElementById('app')!;
const wallet = mountWallet(app, {
  mode: 'popup',
  onNoVault: (hasVault) => noVaultScreen(app, true, hasVault),
  onLocked: () => lockedScreen(app, () => void wallet.load()),
});
void wallet.load(true);
