/**
 * Génère les assets de listing store dans assets/store/ :
 *  - feature-graphic.png (1024×500, bannière Play Store)
 *  - play-icon-512.png (icône haute-résolution)
 *
 * Usage : node scripts/gen-store-assets.js
 * Dépend de @resvg/resvg-js (devDependency) et des polices @expo-google-fonts.
 */
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const ROOT = path.resolve(__dirname, '..');
const p = (rel) => path.join(ROOT, rel);
const b64 = (rel) => fs.readFileSync(p(rel)).toString('base64');

fs.mkdirSync(p('assets/store'), { recursive: true });

const OUTFIT = p('node_modules/@expo-google-fonts/outfit/800ExtraBold/Outfit_800ExtraBold.ttf');
const OUTFIT_SEMI = p('node_modules/@expo-google-fonts/outfit/600SemiBold/Outfit_600SemiBold.ttf');
const INTER = p('node_modules/@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf');

// --- Feature graphic 1024×500 ---
const lion = b64('assets/adaptive-icon.png');
const featureSvg = `<svg width="1024" height="500" viewBox="0 0 1024 500" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#14091F"/><stop offset="0.55" stop-color="#0B0E14"/><stop offset="1" stop-color="#070912"/>
    </linearGradient>
    <radialGradient id="glow" cx="26%" cy="38%" r="55%">
      <stop offset="0" stop-color="#7C5CFF" stop-opacity="0.42"/><stop offset="0.5" stop-color="#4AA8FF" stop-opacity="0.12"/><stop offset="1" stop-color="#4AA8FF" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9E86FF"/><stop offset="1" stop-color="#5FC0FF"/></linearGradient>
  </defs>
  <rect width="1024" height="500" fill="url(#bg)"/>
  <rect width="1024" height="500" fill="url(#glow)"/>
  <image href="data:image/png;base64,${lion}" x="60" y="80" width="340" height="340"/>
  <text x="430" y="215" font-family="Outfit" font-weight="800" font-size="120" fill="#F5F7FA" letter-spacing="1">Kalyx</text>
  <text x="434" y="285" font-family="Inter" font-weight="500" font-size="36" fill="#B7BEC8">Ton wallet crypto non-custodial</text>
  <text x="434" y="345" font-family="Outfit" font-weight="600" font-size="34" fill="url(#accent)">Simple · Souverain · Premium</text>
  <text x="434" y="410" font-family="Inter" font-weight="500" font-size="26" fill="#8A93A6">Multi-chaînes · Swap · dApps · NFT · Ledger</text>
</svg>`;
const feature = new Resvg(featureSvg, {
  fitTo: { mode: 'width', value: 1024 },
  font: { fontFiles: [OUTFIT, OUTFIT_SEMI, INTER], loadSystemFonts: false, defaultFontFamily: 'Inter' },
});
fs.writeFileSync(p('assets/store/feature-graphic.png'), feature.render().asPng());

// --- Icône Play Console 512×512 (depuis icon.png) ---
const icon = b64('assets/icon.png');
const iconSvg = `<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,${icon}" x="0" y="0" width="512" height="512"/></svg>`;
fs.writeFileSync(p('assets/store/play-icon-512.png'), new Resvg(iconSvg, { fitTo: { mode: 'width', value: 512 } }).render().asPng());

console.log('✓ assets/store/feature-graphic.png (1024×500)');
console.log('✓ assets/store/play-icon-512.png (512×512)');
