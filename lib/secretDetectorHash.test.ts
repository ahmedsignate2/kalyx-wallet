import { detectSensitiveSecrets } from './secretDetector';

const HEX = 'a'.repeat(16) + 'b'.repeat(16) + 'c'.repeat(16) + 'd'.repeat(16);
const KEY = '4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318';

it('un hash de transaction CONNU passe, sous toutes ses formes', () => {
  const known = [`0x${HEX}`];
  expect(detectSensitiveSecrets(`Mon envoi bloqué, tx: 0x${HEX}`, known).hasSecret).toBe(false);
  expect(detectSensitiveSecrets(`https://basescan.org/tx/0x${HEX}`, known).hasSecret).toBe(false);
  expect(detectSensitiveSecrets(`0x${HEX}`, known).hasSecret).toBe(false);
});

it('« tx: » ne suffit plus : une valeur inconnue de cette forme reste bloquée (peut être une clé)', () => {
  expect(detectSensitiveSecrets(`problème sur tx: 0x${KEY}`).hasSecret).toBe(true);
  expect(detectSensitiveSecrets(`hash=${KEY}`, [`0x${HEX}`]).hasSecret).toBe(true);
  expect(detectSensitiveSecrets(`https://etherscan.io/tx/0x${KEY}`).hasSecret).toBe(true);
  expect(detectSensitiveSecrets(`voici ma clé 0x${HEX}`).hasSecret).toBe(true);
});
