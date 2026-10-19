/**
 * Avatar de compte : un orbe dont les couleurs viennent de l'adresse. Deux
 * comptes se distinguent d'un coup d'œil, sans image ni service extérieur.
 */
import { h } from './dom';

/** FNV-1a 32 bits : stable, rapide, suffisant pour choisir des teintes. */
function hash(s: string): number {
  let x = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    x ^= s.charCodeAt(i);
    x = Math.imul(x, 0x01000193) >>> 0;
  }
  return x;
}

export function avatar(seed: string, size = 32): HTMLSpanElement {
  const n = hash(seed.toLowerCase());
  const a = n % 360;
  const b = (a + 40 + ((n >>> 9) % 120)) % 360;
  const x = 20 + ((n >>> 17) % 60);
  const y = 20 + ((n >>> 23) % 60);
  return h('span', {
    class: 'avatar',
    'aria-hidden': 'true',
    style: `width:${size}px;height:${size}px;background:radial-gradient(circle at ${x}% ${y}%, hsl(${a} 90% 72%), transparent 62%), linear-gradient(135deg, hsl(${b} 70% 52%), hsl(${(a + 200) % 360} 65% 38%))`,
  });
}
