import { router } from 'expo-router';

/**
 * Retour sûr : sans écran précédent (lien profond, `replace`), `router.back()`
 * ne fait rien et iOS, sans bouton retour système, laisse l'utilisateur bloqué.
 * `/` redirige ensuite vers l'accueil, le déverrouillage ou la bienvenue.
 */
export function goBack(fallback = '/'): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback as never);
}
