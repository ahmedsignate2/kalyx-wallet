#!/usr/bin/env node
/**
 * Icônes de l'extension : LE MÊME logo que l'app (assets/icon.png), pas une
 * reconstruction. L'image de l'app est posée dans un carré arrondi, puis
 * rendue aux tailles que Chrome demande (barre d'outils, extensions, store).
 *
 * 128 px : Chrome recommande ~16 px de marge transparente autour du visuel ;
 * aux petites tailles, le carré occupe presque tout le cadre pour rester lisible.
 *
 *   npm run icons   (dans extension/)
 */
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { deflateSync, crc32 } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(HERE, '../../assets/icon.png');
const OUT = join(HERE, '../public/icon');

/** taille → marge (px) autour du carré arrondi */
const SIZES = { 16: 0, 32: 1, 48: 2, 128: 8 };

const SS = 8;

/** Moyenne de chaque bloc f×f, en alpha prémultiplié (pas de franges sombres sur les bords arrondis). */
function boxDown(px, w, f) {
  const n = w / f;
  const out = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = 0; dy < f; dy++)
        for (let dx = 0; dx < f; dx++) {
          const i = ((y * f + dy) * w + (x * f + dx)) * 4;
          const al = px[i + 3];
          r += px[i] * al; g += px[i + 1] * al; b += px[i + 2] * al; a += al;
        }
      const o = (y * n + x) * 4;
      out[o] = a ? Math.round(r / a) : 0;
      out[o + 1] = a ? Math.round(g / a) : 0;
      out[o + 2] = a ? Math.round(b / a) : 0;
      out[o + 3] = Math.round(a / (f * f));
    }
  return out;
}

/** PNG RGBA minimal (zlib de Node), sans dépendance. */
function encodePng(rgba, n) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(n * (n * 4 + 1));
  for (let y = 0; y < n; y++) Buffer.from(rgba.buffer, y * n * 4, n * 4).copy(raw, y * (n * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const png = readFileSync(SOURCE).toString('base64');
mkdirSync(OUT, { recursive: true });
for (const [s, pad] of Object.entries(SIZES)) {
  const size = Number(s);
  const side = size - pad * 2;
  const r = side * 0.225; // arrondi façon icône d'app
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs><clipPath id="c"><rect x="${pad}" y="${pad}" width="${side}" height="${side}" rx="${r}"/></clipPath></defs>
  <image x="${pad}" y="${pad}" width="${side}" height="${side}" clip-path="url(#c)" xlink:href="data:image/png;base64,${png}"/>
</svg>`;
  /*
   * Réduire 1024 px d'un coup crénèle : à 16 px, des rayons disparaissaient.
   * On rend à 8× puis on moyenne chaque bloc de 8×8 pixels (filtre boîte).
   */
  const big = new Resvg(svg, { fitTo: { mode: 'width', value: size * SS } }).render();
  writeFileSync(join(OUT, `${size}.png`), encodePng(boxDown(big.pixels, size * SS, SS), size));
  console.log(`✓ icon/${size}.png`);
}
