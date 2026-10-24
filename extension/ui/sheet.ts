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
  // Geste : tirer la feuille vers le bas par sa poignée (ou son en-tête) la ferme ; relâchée tôt, elle revient.
  let y0: number | null = null;
  const grab = panel.querySelector<HTMLElement>('.grip')!;
  const head = panel.querySelector<HTMLElement>('.modal-head')!;
  const startDrag = (e: PointerEvent) => {
    if ((e.target as Element).closest('button')) return;
    e.preventDefault(); // pas de sélection de texte (elle ferait partir un glisser-déposer au geste suivant)
    y0 = e.clientY;
    panel.setPointerCapture(e.pointerId);
    panel.classList.add('dragging');
  };
  grab.addEventListener('pointerdown', startDrag);
  head.addEventListener('pointerdown', startDrag);
  panel.addEventListener('pointermove', (e) => {
    if (y0 == null) return;
    panel.style.transform = `translateY(${Math.max(0, e.clientY - y0)}px)`;
  });
  const endDrag = (e: PointerEvent) => {
    if (y0 == null) return;
    const dy = e.clientY - y0;
    y0 = null;
    panel.classList.remove('dragging');
    if (dy > 90) return close();
    panel.style.transform = '';
  };
  panel.addEventListener('pointerup', endDrag);
  panel.addEventListener('pointercancel', () => {
    y0 = null;
    panel.classList.remove('dragging');
    panel.style.transform = '';
  });
  document.addEventListener('keydown', onKey);
  document.body.append(veil);
  requestAnimationFrame(() => panel.focus());
  return { close, body };
}
