/**
 * Génère les PNG d'icônes de Kalyx depuis le logo lion (SVG reconstruit d'après
 * ui/KalyxLogo.tsx), avec un fond dégradé violet→bleu de marque et un lion
 * agrandi pour remplir le cadre (l'ancienne icône était trop petite/plate).
 *
 * Usage : node scripts/genicon.mjs   (nécessite @resvg/resvg-js)
 * Sort : assets/icon.png, adaptive-icon.png, favicon.png, splash.png
 */
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'node:fs';

// --- Lion (repère centré -50..50), fidèle à ui/KalyxLogo.tsx ---
function mane(count, outer, inner, width, rotate, fill) {
  const h = outer - inner;
  let rects = '';
  for (let i = 0; i < count; i++) {
    const angle = rotate + (360 / count) * i;
    rects += `<rect x="${-width / 2}" y="${-outer}" width="${width}" height="${h}" rx="${width / 2}" fill="${fill}" transform="rotate(${angle} 0 0)"/>`;
  }
  return rects;
}

function lion(faceColor = '#F3F0FF') {
  return `
    ${mane(11, 48, 20, 15, 360 / 22, 'url(#kalyxManeBack)')}
    ${mane(11, 45, 16, 17, 0, 'url(#kalyxMane)')}
    <circle cx="-17" cy="-19" r="8" fill="url(#kalyxMane)"/>
    <circle cx="17" cy="-19" r="8" fill="url(#kalyxMane)"/>
    <circle cx="0" cy="2" r="24" fill="${faceColor}"/>
    <ellipse cx="-9" cy="-3" rx="2.6" ry="3.6" fill="#3A2E6B"/>
    <ellipse cx="9" cy="-3" rx="2.6" ry="3.6" fill="#3A2E6B"/>
    <path d="M-5 8 L5 8 L0 13 Z" fill="#6A4DFF"/>
    <path d="M0 13 L0 17 M0 17 C0 20 -4 20 -6 18 M0 17 C0 20 4 20 6 18" stroke="#3A2E6B" stroke-width="2" stroke-linecap="round" fill="none"/>
  `;
}

const DEFS = `
  <defs>
    <linearGradient id="kalyxMane" x1="0" y1="-48" x2="0" y2="48" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#8E6BFF"/><stop offset="1" stop-color="#4AA8FF"/>
    </linearGradient>
    <linearGradient id="kalyxManeBack" x1="0" y1="-48" x2="0" y2="48" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#6A4DFF"/><stop offset="1" stop-color="#3A86E0"/>
    </linearGradient>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#171634"/><stop offset="0.55" stop-color="#0E0E1E"/><stop offset="1" stop-color="#08080F"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="44%" r="55%">
      <stop offset="0" stop-color="#7C5CFF" stop-opacity="0.55"/>
      <stop offset="0.6" stop-color="#4AA8FF" stop-opacity="0.14"/>
      <stop offset="1" stop-color="#4AA8FF" stop-opacity="0"/>
    </radialGradient>
  </defs>`;

/**
 * SVG complet.
 *  size = px ; coverage = fraction du cadre occupée par le lion (0 = pas de lion) ;
 *  bg = 'none' (transparent) | 'flat' (dégradé plein cadre, l'OS arrondit).
 */
function svg(size, coverage, bg) {
  const lionDiameter = 96; // -48..48
  const c = size / 2;
  const background =
    bg === 'flat'
      ? `<rect width="${size}" height="${size}" fill="url(#bg)"/>
         <circle cx="${c}" cy="${size * 0.46}" r="${size * 0.5}" fill="url(#glow)"/>`
      : '';
  const theLion = coverage > 0 ? `<g transform="translate(${c} ${c}) scale(${(coverage * size) / lionDiameter})">${lion()}</g>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${DEFS}
    ${background}
    ${theLion}
  </svg>`;
}

function render(svgStr, out, size) {
  const png = new Resvg(svgStr, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(out, png);
  console.log('✓', out, `${size}×${size}`);
}

// icon.png (iOS + legacy Android) : plein cadre, dégradé + lion (l'OS arrondit).
render(svg(1024, 0.74, 'flat'), 'assets/icon.png', 1024);
// adaptive-icon.png : AVANT-PLAN Android = lion sur transparent, zone sûre (~58 %).
render(svg(1024, 0.58, 'none'), 'assets/adaptive-icon.png', 1024);
// adaptive-bg.png : FOND Android = dégradé de marque (sans lion) → garde le premium.
render(svg(1024, 0, 'flat'), 'assets/adaptive-bg.png', 1024);
// favicon.png : compo icône, petit.
render(svg(196, 0.74, 'flat'), 'assets/favicon.png', 196);
// splash.png : lion sur transparent, centré (le fond vient de la config splash).
render(svg(1024, 0.5, 'none'), 'assets/splash.png', 1024);
