import { addressForChain } from './accountAddress';
import VECTORS from '../src/domain/chains/ton/tonkeeper-vectors.json';

const art = VECTORS.keys.find((k) => k.phrase.endsWith(' art'))!;
const acct = { evmAddress: '0xabc', btcAddress: 'bc1q', solAddress: 'So1', tonPublicKey: art.publicKey };

describe('addressForChain', () => {
  it('chaque famille lit SON adresse', () => {
    expect(addressForChain(acct, { family: 'evm' })).toBe('0xabc');
    expect(addressForChain(acct, { family: 'bitcoin' })).toBe('bc1q');
    expect(addressForChain(acct, { family: 'solana' })).toBe('So1');
  });

  /* La W5 confirmée dans Tonkeeper ; sur le réseau de test, une AUTRE adresse. */
  it('TON : calculée depuis la clé publique, selon le réseau', () => {
    expect(addressForChain(acct, { family: 'ton' })).toBe('UQC020bHeiUqqyw8BB4EttblmRidKkT_hnINJ-8rZCP0L1Dw');
    expect(addressForChain(acct, { family: 'ton', testnet: true })).toBe(art.v5r1Testnet.uq);
  });

  it('TON : la version enregistrée est respectée', () => {
    expect(addressForChain({ ...acct, tonVersion: 'v4r2' }, { family: 'ton' })).toBe(art.v4r2.uq);
  });

  /* Plus aucun repli sur l'EVM : sans clé TON, pas d'adresse TON. */
  it('sans la donnée de sa famille, pas d’adresse — jamais celle d’une autre', () => {
    expect(addressForChain({ evmAddress: '0xabc' }, { family: 'ton' })).toBe('');
    expect(addressForChain({ evmAddress: '0xabc' }, { family: 'solana' })).toBe('');
    expect(addressForChain(null, { family: 'evm' })).toBe('');
  });
});
