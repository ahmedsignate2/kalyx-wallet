import { detectPoisoning, groupAddress, shortAddress, addressFamilies } from './poisoning';

const REAL = '0xd8dA6BF26964aF9D7eEd9e03E62415f8b1F2f8F7';
const FAKE = '0xd8dA00000000000000000000000000000000f8F7'; // même début/fin, milieu différent

describe('empoisonnement d’adresse', () => {
  it('détecte un sosie (même 4 premiers + 4 derniers, milieu différent)', () => {
    expect(detectPoisoning(FAKE, [REAL])?.lookalike).toBe(REAL);
    expect(detectPoisoning(FAKE.toLowerCase(), [REAL])?.lookalike).toBe(REAL);
  });
  it('une adresse connue exacte n’est pas un sosie', () => {
    expect(detectPoisoning(REAL, [REAL])).toBeNull();
    expect(detectPoisoning(REAL.toLowerCase(), [REAL])).toBeNull();
  });
  it('une adresse simplement différente n’alerte pas', () => {
    expect(detectPoisoning('0x28C6c06298d514Db089934071355E5743bf21d60', [REAL])).toBeNull();
  });
  it('Solana : sensible à la casse, même logique', () => {
    const real = '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9';
    const fake = '5tzF000000000000000000000000000000000000uAi9';
    expect(detectPoisoning(fake, [real])?.lookalike).toBe(real);
  });
  it('groupes de 4 et forme courte', () => {
    expect(groupAddress('0xd8dA6BF26964aF9D')).toBe('0xd8dA 6BF2 6964 aF9D');
    expect(groupAddress('5tzFkiKs')).toBe('5tzF kiKs');
    expect(shortAddress(REAL)).toBe('0xd8dA…f8F7');
  });
});

describe('addressFamilies', () => {
  const check = {
    evm: (a: string) => /^0x[a-fA-F0-9]{40}$/.test(a),
    solana: (a: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a),
    bitcoin: (a: string) => /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/.test(a),
  };

  it('une adresse EVM n’appartient qu’à la famille EVM', () => {
    expect(addressFamilies('0x28C6c06298d514Db089934071355E5743bf21d60', check)).toEqual(['evm']);
  });

  it('une adresse bech32 n’appartient qu’à Bitcoin', () => {
    expect(addressFamilies('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', check)).toEqual(['bitcoin']);
  });

  /*
   * Les jeux de caractères de Solana et de Bitcoin se recouvrent en base58 : une
   * même chaîne peut passer les deux validations. On rend l'ensemble plutôt que
   * de trancher arbitrairement — trancher, c'est écarter un contact légitime.
   */
  it('rend PLUSIEURS familles quand l’adresse passe plusieurs validations', () => {
    const r = addressFamilies('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2', check);
    expect(r).toContain('bitcoin');
    expect(r.length).toBeGreaterThanOrEqual(1);
  });

  it('rien pour une chaîne vide ou insensée', () => {
    expect(addressFamilies('', check)).toEqual([]);
    expect(addressFamilies('   ', check)).toEqual([]);
    expect(addressFamilies('pas une adresse !', check)).toEqual([]);
  });
});
