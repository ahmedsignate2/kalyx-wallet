/*
 * Anciennes versions : chaque toucher (position, écran) était journalisé —
 * pavé du code compris. Ces lignes doivent disparaître du disque au chargement.
 */
const stored = JSON.stringify([
  { t: 1, k: 'touch', m: 'toucher (120, 640) sur /unlock' },
  { t: 2, k: 'nav', m: '/home' },
]);
const setItem = jest.fn(async () => {});
jest.mock('react-native', () => ({ Alert: { alert: jest.fn() }, AppState: { addEventListener: jest.fn() } }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => stored),
  setItem: (...a: unknown[]) => (setItem as (...x: unknown[]) => Promise<void>)(...a),
  removeItem: jest.fn(async () => {}),
}));

import { installJournal, journalText } from './debugJournal';

it("efface les touchers des sessions précédentes, en mémoire et sur le disque", async () => {
  installJournal();
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  const text = journalText();
  expect(text).toContain('/home');
  expect(text).not.toContain('toucher');
  const rewritten = (setItem.mock.calls as unknown[][]).map((c) => String(c[1]));
  expect(rewritten.some((v) => v.includes('/home') && !v.includes('touch'))).toBe(true);
});
