import { parseWatchAddress } from './watchAddress';

describe('parseWatchAddress', () => {
  it('EVM : forme EIP-55 ; checksum faux refusé', () => {
    const r = parseWatchAddress('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913');
    expect(r).toEqual({ ok: true, family: 'evm', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' });
    expect(parseWatchAddress('0x833589FCD6eDb6E08f4c7C32D4f71b54bdA02913')).toEqual({ ok: false, error: 'BAD_CHECKSUM' });
  });
  it('Bitcoin bech32 (majuscules d’un QR ramenées) et Solana', () => {
    const btc = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
    expect(parseWatchAddress(btc.toUpperCase())).toEqual({ ok: true, family: 'bitcoin', address: btc });
    expect(parseWatchAddress('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU')).toMatchObject({ ok: true, family: 'solana' });
  });
  it('vide, TON et inconnu : erreurs distinctes', () => {
    expect(parseWatchAddress('  ')).toEqual({ ok: false, error: 'EMPTY' });
    expect(parseWatchAddress('0:' + 'ab'.repeat(32))).toEqual({ ok: false, error: 'TON_UNSUPPORTED' });
    expect(parseWatchAddress('bonjour')).toEqual({ ok: false, error: 'UNKNOWN' });
  });
});
