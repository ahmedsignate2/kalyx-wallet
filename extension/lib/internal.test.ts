import { test, expect } from 'vitest';
import { isOwnExtensionPage } from './internal';

const ID = 'abcdefghijklmnopabcdefghijklmnop';

test('page de l’extension : acceptée', () => {
  expect(isOwnExtensionPage({ id: ID, url: `chrome-extension://${ID}/popup.html` }, ID)).toBe(true);
});

test('script de contenu (même id, URL d’un site) : refusé', () => {
  expect(isOwnExtensionPage({ id: ID, url: 'https://evil.example/', tab: {} }, ID)).toBe(false);
});

test('autre extension : refusée, même si son URL imite la nôtre', () => {
  expect(isOwnExtensionPage({ id: 'zzzz', url: `chrome-extension://${ID}/popup.html` }, ID)).toBe(false);
  expect(isOwnExtensionPage({ id: ID, url: `chrome-extension://${ID}.evil/x` }, ID)).toBe(false);
});

test('expéditeur sans URL : refusé', () => {
  expect(isOwnExtensionPage({ id: ID }, ID)).toBe(false);
});
