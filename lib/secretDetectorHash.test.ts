import { detectSensitiveSecrets } from './secretDetector';

const HEX = 'a'.repeat(16) + 'b'.repeat(16) + 'c'.repeat(16) + 'd'.repeat(16);
it('un hash présenté comme tel passe ; la même valeur seule reste bloquée', () => {
  expect(detectSensitiveSecrets(`Mon envoi bloqué, tx: 0x${HEX}`).hasSecret).toBe(false);
  expect(detectSensitiveSecrets(`https://basescan.org/tx/0x${HEX}`).hasSecret).toBe(false);
  expect(detectSensitiveSecrets(`voici ma clé 0x${HEX}`).hasSecret).toBe(true);
  expect(detectSensitiveSecrets(`0x${HEX}`).hasSecret).toBe(true);
});
