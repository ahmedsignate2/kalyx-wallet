import { findMyAddress } from './isMyAddress';

const accounts = [
  { index: 0, label: '', evmAddress: '0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0bE', btcAddress: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', solAddress: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU' },
  { index: 1, label: '', evmAddress: '0x28C6c06298d514Db089934071355E5743bf21d60', btcAddress: 'bc1qother', solAddress: undefined },
];

describe('findMyAddress', () => {
  it('reconnaît une adresse EVM quelle que soit la casse', () => {
    expect(findMyAddress(accounts as never, '0x28c6c06298d514db089934071355e5743bf21d60')).toEqual({ index: 1, family: 'evm' });
  });
  it('reconnaît Solana et Bitcoin', () => {
    expect(findMyAddress(accounts as never, '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU')).toEqual({ index: 0, family: 'solana' });
    expect(findMyAddress(accounts as never, ' bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh ')).toEqual({ index: 0, family: 'bitcoin' });
  });
  it('rend null pour une adresse étrangère ou vide', () => {
    expect(findMyAddress(accounts as never, '0x0000000000000000000000000000000000000001')).toBeNull();
    expect(findMyAddress(accounts as never, '')).toBeNull();
  });
});
