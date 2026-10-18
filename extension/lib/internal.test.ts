import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOwnExtensionPage } from './internal.ts';

const ID = 'abcdefghijklmnopabcdefghijklmnop';

test('page de l’extension : acceptée', () => {
  assert.equal(isOwnExtensionPage({ id: ID, url: `chrome-extension://${ID}/popup.html` }, ID), true);
});

test('script de contenu (même id, URL d’un site) : refusé', () => {
  assert.equal(isOwnExtensionPage({ id: ID, url: 'https://evil.example/', tab: {} }, ID), false);
});

test('autre extension : refusée, même si son URL imite la nôtre', () => {
  assert.equal(isOwnExtensionPage({ id: 'zzzz', url: `chrome-extension://${ID}/popup.html` }, ID), false);
  assert.equal(isOwnExtensionPage({ id: ID, url: `chrome-extension://${ID}.evil/x` }, ID), false);
});

test('expéditeur sans URL : refusé', () => {
  assert.equal(isOwnExtensionPage({ id: ID }, ID), false);
});
