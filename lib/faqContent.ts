/**
 * Structure de la FAQ (rubriques et questions), source unique : l'écran FAQ
 * l'affiche, la documentation de l'assistant la lit. Les textes sont dans
 * `lib/i18n.ts` (15 langues).
 */
import type { Key } from './i18n';

export interface FaqSectionDef {
  title: Key;
  items: { q: Key; a: Key }[];
}

const qa = (...n: number[]) => n.map((i) => ({ q: `faqQ${i}` as Key, a: `faqA${i}` as Key }));

export const FAQ_SECTIONS: FaqSectionDef[] = [
  { title: 'faqSecWallet', items: qa(1, 2, 3, 4, 22) },
  { title: 'security', items: qa(5, 6, 7, 8, 19, 20) },
  { title: 'transactions', items: qa(9, 10, 11, 12) },
  { title: 'faqSecDapps', items: qa(13, 14, 15, 16) },
  { title: 'network', items: qa(17, 18, 21) },
];
