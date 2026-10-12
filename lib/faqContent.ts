/**
 * Structure de la FAQ (rubriques et questions), source unique : l'écran FAQ
 * l'affiche, la documentation de l'assistant la lit. Les textes sont dans
 * `lib/i18n.ts` (15 langues).
 */
import { Platform } from 'react-native';
import type { Key } from './i18n';

export interface FaqSectionDef {
  title: Key;
  items: { q: Key; a: Key }[];
}

const qa = (...n: number[]) => n.map((i) => ({ q: `faqQ${i}` as Key, a: `faqA${i}` as Key }));

export const FAQ_SECTIONS: FaqSectionDef[] = [
  // Q22 (dons) : absente sur iOS, où l'écran de dons n'existe pas (App Store 3.1.1) — ni FAQ ni assistant n'y renvoient.
  { title: 'faqSecWallet', items: qa(1, 2, 3, 4, 23, 26, ...(Platform.OS === 'ios' ? [] : [22])) },
  { title: 'security', items: qa(5, 6, 7, 8, 27, 24, 25, 19, 20) },
  { title: 'transactions', items: qa(9, 10, 11, 12, 28, 30) },
  { title: 'faqSecDapps', items: qa(13, 14, 15, 16, 29, 31) },
  { title: 'network', items: qa(32, 17, 18, 21) },
];
