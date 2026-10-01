import { buildAddressIndex, lookupAddress } from './isMyAddress';

const accounts = [
  { index: 0, label: '', evmAddress: '0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0bE', btcAddress: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', solAddress: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU' },
  { index: 1, label: '', evmAddress: '0x28C6c06298d514Db089934071355E5743bf21d60', btcAddress: 'bc1qother', solAddress: undefined },
];
const other = [{ index: 0, label: '', evmAddress: '0x000000000000000000000000000000000000dEaD', btcAddress: 'bc1qdead', solAddress: undefined }];
const idx = buildAddressIndex([{ walletId: 'A', accounts: accounts as never }, { walletId: 'B', accounts: other as never }]);

describe('lookupAddress', () => {
  it('EVM quelle que soit la casse', () => {
    expect(lookupAddress(idx, '0x28c6c06298d514db089934071355e5743bf21d60')).toEqual({ walletId: 'A', index: 1, family: 'evm' });
  });
  it('cherche dans TOUS les portefeuilles', () => {
    expect(lookupAddress(idx, '0x000000000000000000000000000000000000dead')).toEqual({ walletId: 'B', index: 0, family: 'evm' });
  });
  it('Solana exact ; une autre casse n’est PAS l’adresse', () => {
    expect(lookupAddress(idx, '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU')).toEqual({ walletId: 'A', index: 0, family: 'solana' });
    expect(lookupAddress(idx, '7xkxtg2cw87d97txjsdpbd5jbkhetqa83tzrujosgasu')).toBeNull();
  });
  it('Bitcoin bech32 et adresse étrangère ou vide', () => {
    expect(lookupAddress(idx, ' bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh ')).toEqual({ walletId: 'A', index: 0, family: 'bitcoin' });
    expect(lookupAddress(idx, '0x0000000000000000000000000000000000000001')).toBeNull();
    expect(lookupAddress(idx, '')).toBeNull();
  });
});
