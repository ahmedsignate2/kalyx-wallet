/**
 * Une adresse en entier, lisible ET copiable.
 *
 * Groupes de 4 caractères séparés VISUELLEMENT (marge CSS), jamais par des
 * espaces : une adresse sélectionnée puis copiée sort d'un seul tenant. Le
 * début et la fin sont en gras — ce qu'on compare d'un coup d'œil, et ce que
 * les adresses sosies imitent (anti-empoisonnement).
 */
import { h } from './dom';

export function addressView(address: string, cls = ''): HTMLElement {
  const s = address.trim();
  const has0x = /^0x/i.test(s);
  const body = has0x ? s.slice(2) : s;
  const groups = body.match(/.{1,4}/g) ?? [];
  const last = groups.length - 1;
  return h(
    'span',
    { class: `addr-v ${cls}`.trim(), translate: 'no', dir: 'ltr' },
    ...groups.map((g, i) => h('span', { class: i === 0 || i === last ? 'hl' : '' }, i === 0 && has0x ? `${s.slice(0, 2)}${g}` : g)),
  );
}

/** Adresse abrégée, sans espace : « 0x4999…b05E ». */
export const shortAddr = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');
