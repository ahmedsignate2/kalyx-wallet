/**
 * Liens profonds : ouvre Kalyx depuis l'extérieur.
 * - `wc:…` (ou `kalyx://wc?uri=…`) → appairage WalletConnect + écran WC.
 * - `ethereum:…` (EIP-681), `bitcoin:…` (BIP-21), `solana:…` (Solana Pay) →
 *   écran Envoyer prérempli, après confirmation. Jamais d'exécution directe.
 * - `kalyx://pay?uri=…` et `https://kalyxwallet.com/pay?uri=…` → même chose,
 *   pour les liens partagés qui doivent rester cliquables sans l'app installée.
 * - `https://pay.walletconnect.com/…` → paiement marchand (WalletConnect Pay).
 * - `kalyx://browse?url=https://…` → ouvre l'URL dans le navigateur dApps.
 * - `kalyx://<route>` est géré nativement par expo-router.
 *
 * DEUX MANQUES CORRIGÉS ICI :
 *
 * 1. `ethereum:` était DÉCLARÉ côté natif (app.config, iOS comme Android) mais
 *    routé nulle part. L'OS proposait donc Kalyx pour une facture EIP-681,
 *    l'app s'ouvrait… et la chaîne tombait à travers toutes les branches, sans
 *    même un message. Un cul-de-sac, déjà livré.
 * 2. Une intention arrivant PORTEFEUILLE VERROUILLÉ était poussée dans le vide :
 *    la barrière de verrouillage ne vit qu'à l'entrée (app/index.tsx), donc au
 *    démarrage à froid ce `push` courait contre le `replace('/unlock')`. Selon
 *    qui gagnait, on atterrissait sur `/send` verrouillé, ou l'intention était
 *    écrasée et perdue. Elle est maintenant mise EN ATTENTE et rejouée au
 *    déverrouillage.
 *
 * Le schéma applicatif est déclaré dans app.config ; l'enregistrement système
 * de `bitcoin:` / `solana:` (intent-filters) prend effet au prochain rebuild.
 */
import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { toast } from '../lib/toast';
import { useSettings } from '../lib/settingsStore';
import { translate } from '../lib/i18n';
import { useDriveFlow } from '../lib/googleDrive';
import { useWallet } from '../lib/walletStore';
import { useSettings as useSettingsStore } from '../lib/settingsStore';
import { router } from 'expo-router';
import {
  parseQr,
  extractWcUri,
  extractPaymentUri,
  extractBrowseUrl,
  extractPayLink,
  type QrResult,
} from '../src';
import { runQrIntent, setPendingIntent } from '../lib/paymentIntent';

export function DeepLinks() {
  useEffect(() => {
    /** Exécute maintenant, ou met en attente si le portefeuille est verrouillé. */
    const act = (result: QrResult) => {
      const w = useWallet.getState();
      /*
       * Démarrage à froid : `getInitialURL()` répond AVANT que le coffre soit
       * lu, et `hasWallet` vaut alors `false` par défaut. Juger ici, c'est
       * répondre « aucun portefeuille » à quelqu'un qui en a un et vient de
       * toucher un lien de paiement. On met de côté et `app/index.tsx`
       * tranche quand l'état est connu.
       */
      if (!w.ready) {
        setPendingIntent(result);
        return;
      }
      if (!w.hasWallet) {
        // Aucun portefeuille : rien à mettre en attente, et rediriger vers la
        // création en avalant le lien serait un mensonge sur ce qui va se passer.
        toast.error(translate(useSettings.getState().language, 'noWalletYet'));
        return;
      }
      if (!w.isUnlocked) {
        // Rejouée par `app/unlock.tsx`, après l'accueil — cf. paymentIntent.
        setPendingIntent(result);
        toast.info(translate(useSettings.getState().language, 'payQueuedUnlock'));
        return;
      }
      void runQrIntent(result);
    };

    const handle = async (url: string | null, coldStart = false) => {
      if (!url) return;
      // Retour de Google (sauvegarde / restauration Drive) : repris ici même si
      // l'app a été relancée. Le résultat est publié dans useDriveFlow.
      if (await useDriveFlow.getState().handleRedirect(url)) {
        const f = useDriveFlow.getState();
        const lang = useSettingsStore.getState().language;
        if (f.kind === 'save' && f.status === 'done') {
          toast.success(translate(lang, 'driveSaved'));
          // Si l'app a été relancée par le retour de Google, l'écran de sauvegarde n'est plus là : on y retourne.
          if (coldStart) {
            if (useWallet.getState().isUnlocked) router.push('/cloud-backup');
            else useDriveFlow.getState().setReturnTo('/cloud-backup');
          }
        } else if (f.kind === 'save' && f.status === 'error') {
          toast.error(translate(lang, 'driveCancelled'), f.error ?? undefined);
          if (coldStart) {
            if (useWallet.getState().isUnlocked) router.push('/cloud-backup');
            else useDriveFlow.getState().setReturnTo('/cloud-backup');
          }
        } else if (f.kind === 'restore') {
          router.replace('/restore-drive');
        } else if (f.status === 'error') {
          toast.error(translate(lang, 'driveCancelled'), f.error ?? undefined);
        }
        return;
      }
      const wc = extractWcUri(url);
      if (wc) {
        act({ kind: 'walletconnect', uri: wc });
        return;
      }
      // URI de paiement : analysée, jamais exécutée — `act` mène à l'écran de
      // confirmation, prérempli, sur la bonne chaîne et avec le bon jeton.
      const pay = extractPaymentUri(url);
      if (pay) {
        act(parseQr(pay));
        return;
      }
      /*
       * Lien de paiement marchand. Testé AVANT `browse` : c'est une URL https,
       * elle finirait sinon dans le navigateur dApps où elle ne sert à rien.
       */
      const payLink = extractPayLink(url);
      if (payLink) {
        act({ kind: 'wc-pay', link: payLink });
        return;
      }
      if (/(^|\/\/)browse\b/i.test(url)) {
        const target = extractBrowseUrl(url);
        if (target) router.push({ pathname: '/browser', params: { url: target } });
      }
    };
    Linking.getInitialURL().then((u) => handle(u, true));
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    return () => sub.remove();
  }, []);
  return null;
}
