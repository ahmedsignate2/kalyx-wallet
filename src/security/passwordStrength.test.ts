import { passwordStrength, MIN_BACKUP_LEVEL } from './passwordStrength';

const ok = (p: string) => passwordStrength(p).level >= MIN_BACKUP_LEVEL;

it('refuse ce qui tombe en quelques secondes hors ligne', () => {
  for (const p of ['12345678', '1234567890', 'password', 'Password2024!', 'azertyuiop', 'abcdefghij', 'aaaaaaaaaaaa', 'Kalyx12345', 'motdepasse1', 'Short1!']) {
    expect(ok(p)).toBe(false);
  }
});

it('accepte un mot de passe raisonnable, et juge fort ce qui l’est', () => {
  expect(ok('Mardi9pluie')).toBe(true);
  expect(passwordStrength('Mardi9pluie').key).toBe('strengthMedium');
  expect(passwordStrength('Tr3s-long-Mot!').key).toBe('strengthStrong');
  expect(passwordStrength('cheval agrafe batterie correct').key).toBe('strengthStrong');
});
