/**
 * PANNEAU LATÉRAL : le même portefeuille que le popup, qui reste ouvert à
 * côté de la page (et ne se ferme pas au premier clic ailleurs).
 */
import { mountScene } from '../../ui/landscape';
import { applyLang } from '../../ui/i18n';
import { mountWallet } from '../../ui/wallet';
import { lockedScreen, noVaultScreen } from '../../ui/screens';

applyLang();
mountScene();
const app = document.getElementById('app')!;
const wallet = mountWallet(app, {
  mode: 'panel',
  onNoVault: (hasVault) => noVaultScreen(app, false, hasVault),
  onLocked: () => lockedScreen(app, () => void wallet.load()),
});
void wallet.load(true);
// Le panneau reste ouvert : il suit le verrouillage automatique sans attendre un clic (sans le repousser).
setInterval(() => void wallet.check(), 30_000);
