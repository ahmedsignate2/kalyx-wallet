/**
 * Empreinte de sauvegarde : ce qui la fait changer, et ce qui ne doit pas.
 * Une sauvegarde annoncée à jour alors qu'un portefeuille n'y est pas est le
 * défaut corrigé ; une empreinte qui fuirait une adresse serait pire.
 */
import { backupDigest, isBackupStale } from './backupDigest';

const A = { id: 'primary', label: 'Principal', type: 'seed' as const };
const B = { id: 'w-2', label: '', type: 'privateKey' as const, keyFamily: 'solana' };
const WATCH = { id: 'w-3', label: 'Suivi', type: 'watch' as const };
const ADDR = '0x52908400098527886E0F7030069857D2E4169EE7';
const accA = [{ index: 0, label: '', evmAddress: ADDR, btcAddress: 'bc1qxyz' }, { index: 1, label: 'Épargne', evmAddress: '0xabc', btcAddress: '' }];

describe('backupDigest', () => {
  it('stable : même contenu dans un autre ordre (portefeuilles et comptes)', () => {
    const d1 = backupDigest([A, B], { primary: accA, 'w-2': [{ index: 0 }] });
    const d2 = backupDigest([B, A], { 'w-2': [{ index: 0 }], primary: [...accA].reverse() });
    expect(d1).toBe(d2);
    expect(d1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('change à l’ajout et à la suppression d’un portefeuille', () => {
    const one = backupDigest([A], { primary: accA });
    const two = backupDigest([A, B], { primary: accA });
    expect(two).not.toBe(one);
    expect(backupDigest([B], {})).not.toBe(two);
  });

  it('change avec un compte ajouté, un compte ou un portefeuille renommé (ils sont dans le fichier)', () => {
    const base = backupDigest([A], { primary: accA });
    expect(backupDigest([A], { primary: [...accA, { index: 2, label: '' }] })).not.toBe(base);
    expect(backupDigest([A], { primary: [accA[0], { ...accA[1], label: 'Autre' }] })).not.toBe(base);
    expect(backupDigest([{ ...A, label: 'Renommé' }], { primary: accA })).not.toBe(base);
  });

  it('ignore ce que la sauvegarde n’emporte pas : adresses suivies et adresses des comptes', () => {
    const base = backupDigest([A], { primary: accA });
    expect(backupDigest([A, WATCH], { primary: accA, 'w-3': [{ index: 0 }] })).toBe(base);
    const otherAddresses = accA.map((a) => ({ ...a, evmAddress: '0x0000000000000000000000000000000000000001' }));
    expect(backupDigest([A], { primary: otherAddresses })).toBe(base);
  });

  it('distingue un portefeuille supprimé puis remplacé par un autre de même nom et type', () => {
    expect(backupDigest([{ ...A, id: 'w-9' }], { 'w-9': accA })).not.toBe(backupDigest([A], { primary: accA }));
  });

  it('ne contient ni adresse ni nom en clair (empreinte, pas sérialisation)', () => {
    const d = backupDigest([A, B], { primary: accA });
    expect(d).not.toContain(ADDR.toLowerCase().slice(2, 12));
    expect(d).not.toContain('Principal');
  });
});

describe('isBackupStale', () => {
  const cur = backupDigest([A], {});
  it('pas de sauvegarde : rien de périmé', () => {
    expect(isBackupStale({ encryptedBackupAt: null, backupDigest: null }, cur)).toBe(false);
  });
  it('même empreinte : à jour ; différente : périmée', () => {
    expect(isBackupStale({ encryptedBackupAt: '2026-10-01T00:00:00Z', backupDigest: cur }, cur)).toBe(false);
    expect(isBackupStale({ encryptedBackupAt: '2026-10-01T00:00:00Z', backupDigest: cur }, backupDigest([A, B], {}))).toBe(true);
  });
  it('sauvegarde d’avant cette version (sans empreinte) : à refaire', () => {
    expect(isBackupStale({ encryptedBackupAt: '2026-10-01T00:00:00Z', backupDigest: null }, cur)).toBe(true);
  });
  it('empreinte courante inconnue (calcul en cours, leurre) : on ne conclut rien', () => {
    expect(isBackupStale({ encryptedBackupAt: '2026-10-01T00:00:00Z', backupDigest: null }, null)).toBe(false);
  });
});
