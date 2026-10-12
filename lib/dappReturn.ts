/**
 * Rendre la main à la dApp après une réponse (connexion, signature, refus).
 *
 * Le lien est validé AVANT (src/domain/web/returnUrl.ts). Sans lien utilisable,
 * Android ramène à l'app précédente avec le bouton retour ; iOS n'offre que la
 * petite flèche en haut à gauche, que peu de gens voient : l'utilisateur restait
 * devant Kalyx, sans savoir que la dApp avait déjà sa réponse. On le lui dit.
 */
import { Linking, Platform } from 'react-native';
import { toast } from './toast';
import { useSettings } from './settingsStore';
import { translate } from './i18n';

/**
 * `url` : lien déjà validé, ou `null`.
 * `hint` : afficher l'indication iOS quand il n'y a pas de lien (succès seulement :
 * après un refus, « c'est fait » serait faux).
 */
export function returnToDappOrHint(url: string | null, hint = true): void {
  const showHint = () => {
    if (!hint || Platform.OS !== 'ios') return;
    toast.success(translate(useSettings.getState().language, 'dappDoneReturnBrowser'));
  };
  if (!url) {
    showHint();
    return;
  }
  // Lien refusé par le système (app désinstallée) : même indication que sans lien.
  Linking.openURL(url).catch(showHint);
}
