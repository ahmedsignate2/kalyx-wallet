/** Une icône de l'app (ui/icons.ts, généré), à la couleur du texte. */
import { ICONS } from './icons';

const NS = 'http://www.w3.org/2000/svg';

export function glyph(name: string, size = 20): SVGElement {
  const def = ICONS[name];
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('glyph');
  if (!def) return svg;
  svg.setAttribute('viewBox', `0 0 ${def.view} ${def.view}`);
  for (const d of def.fill ?? []) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', 'currentColor');
    svg.append(p);
  }
  for (const d of def.stroke ?? []) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '1.75');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    svg.append(p);
  }
  return svg;
}
