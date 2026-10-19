/**
 * Feuille modale : monte du bas, fond flouté, se ferme par le fond, Échap ou
 * le bouton. Le focus va dans la feuille et revient d'où il venait.
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
  const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
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
