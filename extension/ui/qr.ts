/**
 * QR code d'une adresse, dessiné en SVG (éléments créés un par un, jamais
 * d'innerHTML). Toujours sombre sur blanc avec sa marge : c'est ce que les
 * scanners lisent, quel que soit le thème.
 */
import { create } from 'qrcode/lib/core/qrcode';

const NS = 'http://www.w3.org/2000/svg';

export function qrSvg(text: string, px = 200): SVGSVGElement {
  const { modules } = create(text, { errorCorrectionLevel: 'M' });
  const n = modules.size;
  const quiet = 4;
  const size = n + quiet * 2;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (modules.get(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('width', String(px));
  svg.setAttribute('height', String(px));
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img');
  const bg = document.createElementNS(NS, 'rect');
  bg.setAttribute('width', String(size));
  bg.setAttribute('height', String(size));
  bg.setAttribute('fill', '#ffffff');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', '#111111');
  svg.append(bg, path);
  return svg;
}
