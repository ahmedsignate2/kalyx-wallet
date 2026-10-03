jest.mock('react-native', () => ({ Alert: { alert: jest.fn() }, AppState: { addEventListener: jest.fn() } }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}), removeItem: jest.fn(async () => {}) }));

import { installJournal, journalText, journal } from './debugJournal';

const PHRASE = 'abandon ability able about above absent absorb abstract absurd abuse access accident';
const KEY = '4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318';

describe('Journal de diagnostic', () => {
  it('capture la console, sans jamais garder une phrase ni une clé', () => {
    installJournal();
    console.log('[TEST] étape 1', { ok: true });
    console.warn('erreur de dérivation :', PHRASE);
    journal('state', `clé 0x${KEY}`);
    const text = journalText();
    expect(text).toContain('[TEST] étape 1');
    expect(text).not.toContain('abandon ability able');
    expect(text).not.toContain(KEY);
  });
});
