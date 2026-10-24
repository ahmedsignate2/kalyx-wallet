/**
 * RETOURS IMMÉDIATS, partagés par toutes les pages de l'extension :
 *  - une erreur qui apparaît (ou change) se signale : léger tremblement, son
 *    discret si les sons sont activés — sans qu'aucun écran ait à y penser ;
 *  - un appui sur un bouton donne un « tic » sonore (sons activés seulement) ;
 *  - les chargements montrent la forme de ce qui arrive (squelettes), jamais
 *    un contenu inventé.
 */
import { h } from './dom';
import { play } from './sound';
import { reducedMotion } from './motion';

/** Lignes fantômes d'une liste (logo, deux lignes, montant) pendant un chargement. */
export function skeletonList(n: number): HTMLElement {
  return h(
    'div',
    { class: 'list card', 'aria-hidden': 'true' },
    ...Array.from({ length: n }, () => h('div', { class: 'row' }, h('span', { class: 'logo skel' }), h('div', { class: 'grow' }, h('i', { class: 'skel line w40' }), h('i', { class: 'skel line w25' })), h('div', { class: 'right' }, h('i', { class: 'skel line w50' })))),
  );
}

let installed = false;

export function installFeedback(root: HTMLElement = document.body): void {
  if (installed) return;
  installed = true;
  const last = new WeakMap<Element, string>();
  const signal = (el: Element) => {
    const text = el.textContent?.trim() ?? '';
    if (text === (last.get(el) ?? '')) return;
    last.set(el, text);
    if (!text) return;
    play('error');
    if (reducedMotion()) return;
    el.classList.remove('shake');
    void (el as HTMLElement).offsetWidth;
    el.classList.add('shake');
  };
  new MutationObserver((records) => {
    const seen = new Set<Element>();
    for (const r of records) {
      const node = r.target.nodeType === Node.TEXT_NODE ? r.target.parentElement : (r.target as Element);
      const el = node?.closest?.('.error');
      if (el && !seen.has(el)) seen.add(el), signal(el);
      // Un écran entier vient d'arriver avec une erreur déjà remplie.
      for (const n of r.addedNodes) if (n instanceof Element) for (const e of n.matches('.error') ? [n] : n.querySelectorAll('.error')) if (!seen.has(e)) seen.add(e), signal(e);
    }
  }).observe(root, { subtree: true, childList: true, characterData: true });
  root.addEventListener('pointerdown', (e) => {
    const b = (e.target as Element | null)?.closest?.('button:not(:disabled), .row, a.btn');
    if (b && !b.classList.contains('hold')) play('tap');
  });
}

/** Message bref en bas de l'écran (confirmation d'un réglage), lu par les lecteurs d'écran. */
export function toast(text: string, ms = 2400): void {
  document.querySelector('.toast')?.remove();
  const el = h('div', { class: 'toast', role: 'status' }, text);
  document.body.append(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 220);
  }, ms);
}

/** État vide soigné : une icône dans un halo, ce qui manque, ce qui viendra — et, si utile, un geste. */
export function emptyState(icon: Node, title: string, body?: string, action?: HTMLElement, testid?: string): HTMLElement {
  return h(
    'div',
    { class: 'empty-state', 'data-testid': testid ?? false },
    h('span', { class: 'empty-halo', 'aria-hidden': 'true' }, icon),
    h('strong', {}, title),
    body && h('p', { class: 'small muted' }, body),
    action ?? null,
  );
}
