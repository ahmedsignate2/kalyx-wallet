/**
 * Exécuté juste AVANT le script de page quand « Kalyx par défaut » est
 * activé (même enregistrement, ordre garanti) : le script de page prend alors
 * aussi `window.ethereum`. Il efface ce drapeau dès qu'il l'a lu.
 */
export default defineUnlistedScript(() => {
  (window as Window & { __kalyxDefault__?: boolean }).__kalyxDefault__ = true;
});
