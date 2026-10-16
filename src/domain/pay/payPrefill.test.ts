import { prefillFields, prefillFor, prefillComplete, validField, isValidDob, isValidEmail } from './payPrefill';

const schema = JSON.stringify({
  type: 'object',
  required: ['fullName', 'dob', 'pobAddress'],
  properties: { fullName: { type: 'string', title: 'Full name' }, dob: { type: 'string', format: 'date' }, pobAddress: { type: 'string' }, extra: { type: 'object' } },
});

describe('informations du payeur (WalletConnect Pay)', () => {
  it('lit les champs du schéma : obligatoires, date, titre ; ignore les objets', () => {
    const f = prefillFields(schema);
    expect(f.map((x) => x.key)).toEqual(['fullName', 'dob', 'pobAddress']);
    expect(f[1]).toMatchObject({ kind: 'date', required: true });
    expect(f[0].title).toBe('Full name');
    expect(prefillFields('pas du json')).toEqual([]);
    expect(prefillFields(undefined)).toEqual([]);
    expect(prefillFields(JSON.stringify({ required: ['__proto__', 'ok'] })).map((x) => x.key)).toEqual(['ok']);
  });

  it("n'envoie que les champs demandés, valides", () => {
    const f = prefillFields(schema);
    const saved = { fullName: 'Ada Lovelace', dob: '1815-12-10', pobAddress: 'London', other: 'secret' };
    expect(prefillFor(f, saved)).toEqual({ fullName: 'Ada Lovelace', pobAddress: 'London' }); // 1815 < 1900 : refusée
    expect(prefillFor(f, { ...saved, dob: '1990-01-15' })).toEqual({ fullName: 'Ada Lovelace', dob: '1990-01-15', pobAddress: 'London' });
  });

  it('formulaire natif sauté seulement si tout l’obligatoire est enregistré', () => {
    const f = prefillFields(schema);
    expect(prefillComplete(f, { fullName: 'A', dob: '1990-01-15', pobAddress: 'Paris' })).toBe(true);
    expect(prefillComplete(f, { fullName: 'A', dob: '1990-01-15' })).toBe(false);
    expect(prefillComplete(f, null)).toBe(false);
    expect(prefillComplete(prefillFields(JSON.stringify({ properties: { note: { type: 'string' } } })), {})).toBe(false);
  });

  it('dates et e-mails', () => {
    expect(isValidDob('1990-02-30')).toBe(false);
    expect(isValidDob('2999-01-01')).toBe(false);
    expect(isValidDob('15/01/1990')).toBe(false);
    expect(validField({ key: 'n', required: false, kind: 'text' }, '')).toBe(true);
    expect(validField({ key: 'n', required: true, kind: 'text' }, ' ')).toBe(false);
    expect(isValidEmail('ada@example.com')).toBe(true);
    expect(isValidEmail('ada@example')).toBe(false);
  });
});
