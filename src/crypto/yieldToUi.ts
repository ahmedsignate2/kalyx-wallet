/**
 * Laisse passer une image avant un calcul long (scrypt, PBKDF2).
 *
 * Les variantes « async » de @noble/hashes ne rendent la main qu'en microtâche :
 * React n'affichait donc ni l'indicateur d'attente ni l'état « occupé » avant
 * que le calcul ne bloque le fil JS (1 à 3 s sur Hermes iOS). Une fois l'image
 * validée, l'indicateur natif tourne sur le fil UI pendant le calcul.
 *
 * Plafonné à 50 ms : `requestAnimationFrame` ne se déclenche pas app en
 * arrière-plan, et le calcul ne doit pas attendre son retour.
 */
export function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    const raf = (globalThis as { requestAnimationFrame?: (cb: () => void) => unknown }).requestAnimationFrame;
    if (typeof raf === 'function') raf(() => setTimeout(finish, 0));
    setTimeout(finish, 50);
  });
}
