/**
 * LE PAYSAGE DE L'APP, en SVG pour l'extension : le ciel de l'accueil qui suit
 * l'heure (aube, jour, crépuscule, nuit) et les dunes de scène des autres
 * écrans. Géométrie et palettes viennent de l'app (ui/landscapeScene.ts) : le
 * même ciel, au même moment, sur le téléphone et dans le navigateur.
 *
 * Construit élément par élément (jamais d'innerHTML), dans un cadre fixe que
 * le navigateur met à l'échelle : la même image sur 360 px ou un grand panneau.
 */
import { hillPaths, SCENE_DUNES, SCENES, stars, type Hill } from '../../ui/landscapeScene';
import { skyPhaseNow, type SkyPhase } from '../../lib/skyClock';

const NS = 'http://www.w3.org/2000/svg';
let uid = 0;

function s(tag: string, attrs: Record<string, string | number> = {}, ...children: Element[]): SVGElement {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  el.append(...children);
  return el;
}

const linear = (id: string, stops: [number, string, number?][], x1 = 0, y1 = 0, x2 = 0, y2 = 1) =>
  s('linearGradient', { id, x1, y1, x2, y2 }, ...stops.map(([o, c, a]) => s('stop', { offset: o, 'stop-color': c, 'stop-opacity': a ?? 1 })));

/** Une colline : lumière côté astre → ombre, liseré clair sur la crête (comme l'app). */
function hill(w: number, hh: number, x: Hill, rim: number) {
  const id = `k-h${uid++}`;
  const p = hillPaths(w, hh, x);
  return [s('defs', {}, linear(id, [[0, x.lit], [1, x.shadow]], 0.9, 0, 0.1, 1)), s('path', { d: p.fill, fill: `url(#${id})` }), s('path', { d: p.rim, fill: 'none', stroke: '#FFFFFF', 'stroke-opacity': rim * 0.45, 'stroke-width': 1 })];
}

function haze(w: number, hh: number, color: string, from: number, to: number, opacity: number) {
  const id = `k-z${uid++}`;
  return [s('defs', {}, linear(id, [[0, color, 0], [0.6, color, opacity], [1, color, 0]])), s('rect', { x: 0, y: from * hh, width: w, height: (to - from) * hh, fill: `url(#${id})` })];
}

/** Le ciel de l'accueil. `sunAt` : hauteur de l'astre ; `veil` : voile sombre en bas ; `glow` : halo derrière le solde. */
export function landscape(opts: { phase?: SkyPhase; width?: number; height?: number; sunAt?: number; veil?: boolean; glow?: number } = {}): SVGElement {
  const phase = opts.phase ?? skyPhaseNow();
  const w = opts.width ?? 400;
  const hh = opts.height ?? 340;
  const sc = SCENES[phase];
  const night = phase === 'night';
  const [far, back, mid, near] = sc.hills;
  const sky = `k-sky${uid++}`;
  const bal = `k-bal${uid++}`;
  const glowId = `k-glow${uid++}`;
  const veilId = `k-veil${uid++}`;
  const sunX = w * 0.74;
  const sunY = hh * (opts.sunAt ?? 0.5);
  const gs = w * 1.1;
  const svg = s(
    'svg',
    { viewBox: `0 0 ${w} ${hh}`, preserveAspectRatio: 'xMidYMax slice', 'aria-hidden': 'true', class: 'landscape', 'data-phase': phase },
    s(
      'defs',
      {},
      linear(sky, [[0, sc.sky[0]], [0.5, sc.sky[1]], [0.8, sc.sky[2]]]),
      s('radialGradient', { id: bal, cx: '28%', cy: '30%', r: '62%' }, s('stop', { offset: 0, 'stop-color': sc.glow, 'stop-opacity': opts.glow ?? 0 }), s('stop', { offset: 1, 'stop-color': sc.glow, 'stop-opacity': 0 })),
      s('radialGradient', { id: glowId, cx: '50%', cy: '50%', r: '50%' }, s('stop', { offset: 0, 'stop-color': sc.glow, 'stop-opacity': night ? 0.4 : 0.75 }), s('stop', { offset: 0.3, 'stop-color': sc.glow, 'stop-opacity': night ? 0.14 : 0.3 }), s('stop', { offset: 1, 'stop-color': sc.glow, 'stop-opacity': 0 })),
      linear(veilId, [[0.42, '#0B0A18', 0], [1, '#0B0A18', 0.5]]),
    ),
    s('rect', { x: 0, y: 0, width: w, height: hh, fill: `url(#${sky})` }),
    s('rect', { x: 0, y: 0, width: w, height: hh, fill: `url(#${bal})` }),
    ...(sc.stars ? stars(w, hh).map((x) => s('circle', { cx: x.x, cy: x.y, r: x.r, fill: '#FFFFFF', opacity: night ? x.o : x.o * 0.45 })) : []),
    // L'astre et son halo, qui respire lentement (figé si « réduire les animations »).
    s('circle', { class: 'breath', cx: sunX, cy: sunY, r: gs / 2, fill: `url(#${glowId})` }),
    s('circle', { cx: sunX, cy: sunY, r: night ? w * 0.035 : w * 0.05, fill: sc.sun }),
    ...hill(w, hh, far, 0.45),
    ...haze(w, hh, sc.haze, 0.5, 0.86, 0.32),
    ...hill(w, hh, back, 0.22),
    ...haze(w, hh, sc.haze, 0.62, 0.92, 0.22),
    ...hill(w, hh, mid, 0.4),
    ...hill(w, hh, near, 0.5),
    ...(opts.veil ? [s('rect', { x: 0, y: 0, width: w, height: hh, fill: `url(#${veilId})` })] : []),
  );
  return svg;
}

/** Les dunes de scène des écrans secondaires (en haut, fondues vers le fond), Crème ou Nuit. */
export function dunes(mode: 'light' | 'dark', width = 400, height = 200): SVGElement {
  const p = SCENE_DUNES[mode];
  const bg = mode === 'dark' ? '#0B0B10' : '#F4EEE5';
  const shapes = p.hills.map((x) => ({ ...x, base: x.base - 0.2, peaks: x.peaks.map(([cx, amp, sg]) => [cx, amp * 0.75, sg] as const) }));
  const wash = `k-w${uid++}`;
  const fade = `k-f${uid++}`;
  const g = s('g', { opacity: mode === 'dark' ? 0.5 : 1 }, ...hill(width, height, shapes[0], 0.5), ...haze(width, height, p.haze, 0.45, 0.85, mode === 'dark' ? 0.25 : 0.35), ...hill(width, height, shapes[1], 0.35), ...hill(width, height, shapes[2], 0.45), ...hill(width, height, shapes[3], 0.5));
  return s(
    'svg',
    { viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: 'xMidYMax slice', 'aria-hidden': 'true', class: `dunes dunes-${mode}` },
    s('defs', {}, linear(wash, [[0, p.wash, 1], [1, p.wash, 0.2]]), linear(fade, [[0.7, bg, 0], [1, bg, 1]])),
    s('rect', { x: 0, y: 0, width, height, fill: `url(#${wash})` }),
    g,
    s('rect', { x: 0, y: 0, width, height, fill: `url(#${fade})` }),
  );
}

/** Décor d'un écran secondaire : les dunes des deux thèmes, la feuille de style montre la bonne. */
export function scene(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'scene';
  el.setAttribute('aria-hidden', 'true');
  el.append(dunes('light'), dunes('dark'));
  return el;
}

/** Pose le décor (dunes) derrière toute la page, une fois. */
export function mountScene(doc: Document = document): void {
  if (doc.querySelector('body > .scene')) return;
  doc.body.prepend(scene());
}
