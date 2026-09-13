/**
 * Glyphe d'adresse (§2.9) — une étoile UNIQUE dérivée du hash d'une adresse :
 * nombre de branches (5–9), longueur des branches, rotation, deux couleurs
 * d'une palette douce. Pur et déterministe : même adresse → même étoile,
 * partout (compte, contacts, destinataire, signature, QR).
 *
 * Vérification visuelle anti-empoisonnement : un destinataire habituel dont
 * l'étoile change, ça se voit avant de lire l'adresse.
 */
import { sha256 } from '@noble/hashes/sha256';
import { utf8ToBytes } from '@noble/hashes/utils';

export interface AddressGlyphSpec {
  points: number; // 5..9
  /** Rayon intérieur relatif (0.35..0.65) → étoile plus ou moins « piquante ». */
  inner: number;
  /** Rotation en degrés (0..360). */
  rotation: number;
  /** Deux couleurs (dégradé de l'étoile), palette douce. */
  colors: [string, string];
  /** Petit satellite (0 = aucun, sinon angle en degrés). */
  satellite: number | null;
}

/** Palette douce (lumière stellaire) — jamais les couleurs sémantiques (up/down/danger). */
export const GLYPH_PALETTE = [
  '#CFE3FF', '#FFD9B8', '#E8D5FF', '#C9F5E4', '#FFE4C9', '#D8E7FF', '#F5D0E6', '#D9F0FF', '#FFF1C9', '#E0FFF6',
] as const;

export function glyphFor(address: string): AddressGlyphSpec {
  const h = sha256(utf8ToBytes(address.trim().toLowerCase()));
  const points = 5 + (h[0] % 5); // 5..9
  const inner = 0.35 + (h[1] / 255) * 0.3;
  const rotation = (h[2] / 255) * 360;
  const c1 = GLYPH_PALETTE[h[3] % GLYPH_PALETTE.length];
  let c2 = GLYPH_PALETTE[h[4] % GLYPH_PALETTE.length];
  if (c2 === c1) c2 = GLYPH_PALETTE[(h[4] + 1) % GLYPH_PALETTE.length];
  const satellite = h[5] % 3 === 0 ? (h[6] / 255) * 360 : null;
  return { points, inner, rotation, colors: [c1, c2], satellite };
}

/** Chemin SVG de l'étoile (centre cx,cy ; rayon extérieur r). */
export function starPath(spec: AddressGlyphSpec, cx: number, cy: number, r: number): string {
  const n = spec.points * 2;
  const rot = (spec.rotation * Math.PI) / 180 - Math.PI / 2;
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const rad = i % 2 === 0 ? r : r * spec.inner;
    const a = rot + (i * Math.PI) / spec.points;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}
