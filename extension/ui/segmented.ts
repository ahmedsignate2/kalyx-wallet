/**
 * Onglets segmentés : une piste, la pilule glisse sous l'onglet choisi (pour
 * 2 ou 3 onglets). Rendu neuf à chaque appel : la pilule part de l'ancien
 * onglet (`from`) et glisse vers le nouveau.
 */
import { h } from './dom';

let lastIndex = new WeakMap<object, number>();

export function segmented(labels: string[], index: number, onPick: (i: number) => void, key: object = labels): HTMLElement {
  const from = lastIndex.get(key) ?? index;
  const el = h(
    'div',
    { class: 'tabs', role: 'tablist', style: `--n:${labels.length};--i:${from}` },
    ...labels.map((l, i) =>
      h('button', { class: `tab${i === index ? ' on' : ''}`, type: 'button', role: 'tab', 'aria-selected': String(i === index), on: { click: () => i !== index && (lastIndex.set(key, index), onPick(i)) } }, l),
    ),
  );
  if (from !== index) requestAnimationFrame(() => el.style.setProperty('--i', String(index)));
  lastIndex.set(key, index);
  return el;
}

/** Pour les tests. */
export function resetSegmented(): void {
  lastIndex = new WeakMap();
}
