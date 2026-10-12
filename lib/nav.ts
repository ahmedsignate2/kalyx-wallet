import { useCallback } from 'react';
import { router, useNavigationContainerRef } from 'expo-router';

/**
 * Retour sûr : sans écran précédent (lien profond, `replace`), `router.back()`
 * ne fait rien et iOS, sans bouton retour système, laisse l'utilisateur bloqué.
 * `/` redirige ensuite vers l'accueil, le déverrouillage ou la bienvenue.
 */
export function goBack(fallback = '/'): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback as never);
}

/**
 * Arrivée à l'accueil EN FIN DE PARCOURS (naissance du wallet, création ou
 * import depuis le menu, déverrouillage).
 *
 * Un simple `router.replace('/home')` ne remplaçait que l'écran du dessus :
 *  - à l'onboarding, la pile restait [bienvenue, sauvegarde, vérification,
 *    (onglets)] et le balayage depuis le bord gauche de l'Accueil, sur iOS,
 *    ramenait dans l'onboarding ;
 *  - depuis le menu ([(onglets), portefeuilles, import]), il EMPILAIT un second
 *    jeu d'onglets par-dessus le premier, que le même balayage découvrait.
 *
 * On ferme donc d'abord tout ce qui est au-dessus du premier écran
 * (`dismissAll`, seulement s'il y a quelque chose à fermer), puis :
 *  - onglets déjà à la racine → `navigate` : on y revient sur l'onglet Accueil,
 *    sans les remonter (état des onglets conservé) ;
 *  - sinon (bienvenue à la racine) → `replace` : la pile finale est [(onglets)].
 * La racine est lue AVANT d'agir : les deux actions passent par la même file
 * d'expo-router, dans l'ordre, et la seconde s'applique à la pile déjà vidée.
 */
export function useResetToHome(): () => void {
  const navRef = useNavigationContainerRef();
  return useCallback(() => {
    const root = navRef.isReady() ? navRef.getRootState() : undefined;
    const tabsAtRoot = root?.routes[0]?.name === '(tabs)';
    if (router.canDismiss()) router.dismissAll();
    if (tabsAtRoot) router.navigate('/home');
    else router.replace('/home');
  }, [navRef]);
}
