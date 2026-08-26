const fs = require('fs');
const { Resvg } = require('@resvg/resvg-js');

// Constants
const ACCENT = '#C9A24B';
const BG = '#0B0E14'; // Background color for iOS non-transparent icon

// Re-create the 16 segments of the NovaRing
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
  
  // To rotate in SVG: transform="rotate(angle 0 0)"
  segments += `
    <g transform="rotate(${angle} 0 0)">
      <rect x="${x}" y="${y}" width="${width}" height="${h}" rx="${width / 2}" fill="${ACCENT}" />
    </g>
  `;
}

const svgForeground = `
<svg width="1024" height="1024" viewBox="-50 -50 100 100" xmlns="http://www.w3.org/2000/svg">
  ${segments}
</svg>
`;

const svgIcon = `
<svg width="1024" height="1024" viewBox="-50 -50 100 100" xmlns="http://www.w3.org/2000/svg">
  <rect x="-50" y="-50" width="100" height="100" fill="${BG}" />
  ${segments}
</svg>
`;

// Adaptive Icon (Foreground with transparent BG)
const resvgFg = new Resvg(svgForeground, {
  fitTo: {
    mode: 'width',
    value: 1024,
  },
});
const pngFg = resvgFg.render().asPng();
fs.writeFileSync('assets/adaptive-icon.png', pngFg);

// Regular Icon (With dark background for iOS/Fallback)
const resvgIcon = new Resvg(svgIcon, {
  fitTo: {
    mode: 'width',
    value: 1024,
  },
});
const pngIcon = resvgIcon.render().asPng();
fs.writeFileSync('assets/icon.png', pngIcon);
fs.writeFileSync('assets/splash.png', pngIcon); // Use it for splash too, or maybe smaller? 
// Actually, splash usually has the logo in the center but let's keep it simple or make a specific splash

const svgSplash = `
<svg width="1024" height="1024" viewBox="-150 -150 300 300" xmlns="http://www.w3.org/2000/svg">
  <rect x="-150" y="-150" width="300" height="300" fill="${BG}" />
  ${segments}
</svg>
`;
const resvgSplash = new Resvg(svgSplash, {
  fitTo: {
    mode: 'width',
    value: 1280, // Typical splash width base
  },
});
fs.writeFileSync('assets/splash.png', resvgSplash.render().asPng());

console.log('Successfully generated assets/adaptive-icon.png, assets/icon.png, assets/splash.png');
