/**
 * File d'affichage des fenêtres (Modal) de PREMIER NIVEAU, pour iOS.
 *
 * UIKit ne présente qu'UNE fenêtre à la fois depuis un même contrôleur : une
 * Modal ouverte pendant qu'une autre est affichée — ou ENCORE EN TRAIN DE SE
 * FERMER (~0,3 s d'animation) — n'apparaît jamais, alors que React la croit
 * ouverte. Rien ne relançait l'affichage : « Signer » fermait la demande
 * WalletConnect et la confirmation par code ne venait pas, le succès d'un
 * échange restait invisible, le menu du navigateur n'ouvrait plus ses feuilles.
 *
 * Ici, chaque fenêtre de premier niveau demande son tour ; une seule tient la
 * place, jusqu'à la FIN de sa fermeture (onDismiss natif, ou délai de secours).
 * Les fenêtres imbriquées (montées DANS une autre) ne passent pas par la file :
 * iOS les présente par-dessus leur parente, cela fonctionne déjà.
 */

type Listener = () => void;

/** Délai de secours si onDismiss ne vient pas (fenêtre démontée, jamais présentée). */
export const RELEASE_FALLBACK_MS = 600;

let holder: string | null = null;
/** La tenante a été refermée : on attend la fin de l'animation. */
let releasing = false;
/** Rouverte pendant sa propre fermeture : elle garde la place, mais attend la fin de l'animation. */
let rerequested = false;
let queue: string[] = [];
let releaseTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Listener>();

function emit() {
  for (const l of [...listeners]) l();
}

function advance() {
  if (holder !== null) return;
  const next = queue.shift();
  if (next !== undefined) holder = next;
  emit();
}

export function subscribeModalGate(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Vrai si `id` peut être présentée maintenant. */
export function modalHasTurn(id: string): boolean {
  return holder === id && !releasing;
}

/** La fenêtre veut s'afficher : elle prend la place libre, ou fait la queue. */
export function requestModal(id: string): void {
  if (holder === id) {
    /*
     * Rouverte pendant sa propre fermeture : elle garde sa place, mais n'est
     * présentée qu'une fois la fermeture finie — présentée tout de suite, UIKit
     * l'ignorait (c'est le cas même que cette file évite).
     */
    if (releasing) rerequested = true;
    return;
  }
  if (queue.includes(id)) return;
  if (holder === null) {
    holder = id;
    emit();
    return;
  }
  queue.push(id);
}

/**
 * La fenêtre ne veut plus s'afficher. Si elle tenait la place, on la libère à
 * la fin de la fermeture (`modalDismissed`) ou, à défaut, après le délai de secours.
 */
export function withdrawModal(id: string): void {
  if (holder !== id) {
    queue = queue.filter((q) => q !== id);
    return;
  }
  if (releasing) {
    rerequested = false; // re-fermée avant la fin : la demande de réouverture tombe
    return;
  }
  releasing = true;
  emit();
  releaseTimer = setTimeout(() => modalDismissed(id), RELEASE_FALLBACK_MS);
}

/** Fermeture native terminée (onDismiss) : place au suivant. */
export function modalDismissed(id: string): void {
  if (holder !== id || !releasing) return;
  if (releaseTimer) clearTimeout(releaseTimer);
  releaseTimer = null;
  releasing = false;
  if (rerequested) {
    rerequested = false;
    emit(); // même fenêtre, à nouveau présentée
    return;
  }
  holder = null;
  advance();
}

/** Tests uniquement. */
export function resetModalGateForTests(): void {
  if (releaseTimer) clearTimeout(releaseTimer);
  releaseTimer = null;
  holder = null;
  releasing = false;
  rerequested = false;
  queue = [];
  listeners.clear();
}
