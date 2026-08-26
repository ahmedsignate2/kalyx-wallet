const fs = require('fs');
const { Resvg } = require('@resvg/resvg-js');

const ACCENT = '#C9A24B';
const BG = '#0B0E14'; 

let segments = '';
for (let i = 0; i < 16; i++) {
  const angle = (360 / 16) * i;
  const rad = (angle * Math.PI) / 180;
  const baseOuter = 38 + 6 * Math.cos(rad);
  const inner = 20;
  const width = 5.5;
  const h = baseOuter - inner;
  const y = -baseOuter;
  const x = -width / 2;
  segments += `<g transform="rotate(${angle} 0 0)"><rect x="${x}" y="${y}" width="${width}" height="${h}" rx="${width / 2}" fill="${ACCENT}" /></g>`;
}

// Adaptive Icon Foreground: Needs more padding so it doesn't get cropped by the OEM masks.
// Viewbox 160 means radius is 80. Logo radius is 44. 44/80 = 55% of the total size, which fits nicely in the 66% safe zone.
const svgForeground = `
<svg width="1024" height="1024" viewBox="-80 -80 160 160" xmlns="http://www.w3.org/2000/svg">
  ${segments}
</svg>
`;

// Standard Icon (iOS): Viewbox 120 means radius 60. Logo radius 44. 44/60 = 73%. Leaves a nice margin.
const svgIcon = `
<svg width="1024" height="1024" viewBox="-60 -60 120 120" xmlns="http://www.w3.org/2000/svg">
  <rect x="-60" y="-60" width="120" height="120" fill="${BG}" />
  ${segments}
</svg>
`;

const svgSplash = `
<svg width="1280" height="1280" viewBox="-120 -120 240 240" xmlns="http://www.w3.org/2000/svg">
  <rect x="-120" y="-120" width="240" height="240" fill="${BG}" />
  ${segments}
</svg>
`;

fs.writeFileSync('assets/adaptive-icon.png', new Resvg(svgForeground, { fitTo: { mode: 'width', value: 1024 } }).render().asPng());
fs.writeFileSync('assets/icon.png', new Resvg(svgIcon, { fitTo: { mode: 'width', value: 1024 } }).render().asPng());
fs.writeFileSync('assets/splash.png', new Resvg(svgSplash, { fitTo: { mode: 'width', value: 1280 } }).render().asPng());

console.log('Icons generated with proper padding!');
