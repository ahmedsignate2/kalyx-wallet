/**
 * Feuille modale : monte du bas, fond flouté, se ferme par le fond, Échap ou
 * le bouton. Le focus va dans la feuille, y reste (Tab boucle), et revient
 * d'où il venait.
 */
import { h } from './dom';
import { glyph } from './glyph';
import { t } from './i18n';

export function openSheet(title: string, ...content: (Node | false | null | undefined)[]): { close: () => void; body: HTMLElement } {
  const back = document.activeElement as HTMLElement | null;
  const body = h('div', { class: 'sheet-body' }, ...content.filter((c): c is Node => !!c));
  const panel = h(
    'div',
    { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, tabIndex: -1 },
    h('div', { class: 'grip', 'aria-hidden': 'true' }),
    h('header', { class: 'modal-head' }, h('strong', {}, title), h('button', { class: 'icon', type: 'button', 'aria-label': t('close'), on: { click: () => close() } }, glyph('close', 20))),
    body,
  );
  const veil = h('div', { class: 'veil', on: { click: (e) => e.target === veil && close() } }, panel);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') return close();
    // Tab reste DANS la feuille (lecteur d'écran, clavier) : on ne tombe pas sur la page derrière le voile.
    if (e.key !== 'Tab') return;
    const items = [...panel.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])')].filter((el) => !(el as HTMLButtonElement).disabled && !el.hidden && el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const at = document.activeElement;
    if (e.shiftKey && (at === first || at === panel)) (e.preventDefault(), last.focus());
    else if (!e.shiftKey && at === last) (e.preventDefault(), first.focus());
  };
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    veil.classList.add('out');
    const done = () => (veil.remove(), back?.focus?.());
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) done();
    else setTimeout(done, 160);
  }
  document.addEventListener('keydown', onKey);
  document.body.append(veil);
  requestAnimationFrame(() => panel.focus());
  return { close, body };
}
