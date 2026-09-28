/**
 * Coupe TOUTES les connexions : sessions WalletConnect, sessions TON Connect,
 * sites connectés et « de confiance » du navigateur (avec leur historique).
 *
 * Appelé par la réinitialisation : effacer les portefeuilles sans couper les
 * connexions laissait les dApps « toujours connectées » après une réimportation,
 * et les sites de confiance se reconnectaient sans demander le code.
 * Chaque étape est indépendante : l'échec de l'une n'empêche pas les autres.
 */
import { useWalletConnect } from './walletconnect';
import { useDappActivity } from './dappActivity';

export async function disconnectEverything(): Promise<void> {
  console.log('[KALYX-RESET] déconnexion de tout');
  useDappActivity.getState().clear();
  await Promise.all([
    useWalletConnect
      .getState()
      .disconnectAll()
      .catch((e) => console.warn('[KALYX-RESET] WalletConnect', e instanceof Error ? e.message : String(e))),
    import('./tonconnect/store')
      .then(async ({ useTonConnect }) => {
        const tc = useTonConnect.getState();
        await Promise.all(tc.sessions.map((s) => tc.disconnect(s.clientId).catch(() => {})));
      })
      .catch((e) => console.warn('[KALYX-RESET] TON Connect', e instanceof Error ? e.message : String(e))),
  ]);
  console.log('[KALYX-RESET] terminé');
}

/** Connexions d'UN portefeuille supprimé : ses sessions WalletConnect (par adresse) et TON Connect (par portefeuille). */
export async function disconnectWallet(walletId: string, addresses: string[]): Promise<void> {
  console.log('[KALYX-RESET] déconnexion du portefeuille supprimé', { walletId, addresses: addresses.length });
  await Promise.all([
    useWalletConnect.getState().disconnectAddresses(addresses).catch(() => {}),
    import('./tonconnect/store')
      .then(async ({ useTonConnect }) => {
        const tc = useTonConnect.getState();
        await Promise.all(tc.sessions.filter((s) => s.walletId === walletId).map((s) => tc.disconnect(s.clientId).catch(() => {})));
      })
      .catch(() => {}),
  ]);
}
