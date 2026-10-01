import { normalizeAddressCase } from './addressCase';

describe('normalizeAddressCase', () => {
  it('EVM, bech32 et TON brut : casse ignorée', () => {
    expect(normalizeAddressCase('0x28C6c06298d514Db089934071355E5743bf21d60')).toBe('0x28c6c06298d514db089934071355e5743bf21d60');
    expect(normalizeAddressCase('BC1QXY2KGDYGJRSQTZQ2N0YRF2493P83KKFJHX0WLH')).toBe('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh');
  });
  it('Solana et base58 : casse conservée, même s’ils commencent par « bc1 »', () => {
    expect(normalizeAddressCase('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU')).toBe('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU');
    expect(normalizeAddressCase('bc1AbCdEfGhJkMnPqRsTuVwXyZ23456789abcdefgh')).toBe('bc1AbCdEfGhJkMnPqRsTuVwXyZ23456789abcdefgh');
    expect(normalizeAddressCase('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).toBe('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
  });
});

describe('détection d’empoisonnement — règle de casse partagée', () => {
  const { detectPoisoning } = require('./poisoning');
  it('BC1Q… en majuscules (QR) = la même adresse bech32 connue', () => {
    const known = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
    expect(detectPoisoning(known.toUpperCase(), [known])).toBeNull();
  });
  it('0X majuscule = la même adresse EVM', () => {
    expect(normalizeAddressCase('0X833589FCD6EDB6E08F4C7C32D4F71B54BDA02913')).toBe('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913');
  });
});
