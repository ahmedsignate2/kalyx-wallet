import { checkSigner, requestedEvmSigner } from './signerAccount';

const A = '0x1111111111111111111111111111111111111111';
const B = '0x84e9000000000000000000000000000000005eb3';
const C = '0x9999999999999999999999999999999999999999';
const accounts = [
  { index: 0, label: 'Compte 1', evmAddress: A, solAddress: 'SolA' },
  { index: 1, label: 'Compte 2', evmAddress: B, solAddress: 'SolB' },
];
const base = { ns: 'eip155', accounts, activeIndex: 0 };

describe('requestedEvmSigner', () => {
  it('lit le signataire de chaque méthode', () => {
    expect(requestedEvmSigner('eth_sendTransaction', [{ from: B, to: A }])).toBe(B);
    expect(requestedEvmSigner('personal_sign', ['0x68656c6c6f', B])).toBe(B);
    expect(requestedEvmSigner('personal_sign', [B, '0x68656c6c6f'])).toBe(B);
    expect(requestedEvmSigner('eth_signTypedData_v4', [B, '{}'])).toBe(B);
    expect(requestedEvmSigner('eth_sign', [B, '0xabcd'])).toBe(B);
    expect(requestedEvmSigner('eth_sendTransaction', [{ to: A }])).toBeUndefined();
    expect(requestedEvmSigner('wallet_switchEthereumChain', [{ chainId: '0x1' }])).toBeUndefined();
  });
});

describe('checkSigner', () => {
  it('accepte le compte actif quand la demande le nomme', () => {
    expect(checkSigner({ ...base, shared: [A, B], method: 'personal_sign', params: ['0x00', A] })).toEqual({ ok: true });
  });

  it('demande pour un autre compte partagé du portefeuille : propose de signer avec lui', () => {
    const r = checkSigner({ ...base, shared: [A, B], method: 'eth_sendTransaction', params: [{ from: B, to: C }] });
    expect(r).toEqual({ ok: false, address: B, switchTo: accounts[1] });
  });

  it('adresse en casse différente : même compte', () => {
    expect(checkSigner({ ...base, shared: [A.toUpperCase().replace('0X', '0x')], method: 'personal_sign', params: ['0x00', A] })).toEqual({ ok: true });
  });

  it('compte actif absent de la session, sans signataire nommé : le premier partagé', () => {
    const r = checkSigner({ ...base, shared: [B], method: 'wallet_watchAsset', params: [] });
    expect(r).toEqual({ ok: false, address: B, switchTo: accounts[1] });
  });

  it('compte jamais partagé avec le site : refus sans proposition', () => {
    expect(checkSigner({ ...base, shared: [A], method: 'personal_sign', params: ['0x00', B] })).toEqual({ ok: false, address: B });
  });

  it('compte partagé mais pas dans ce portefeuille : refus sans proposition', () => {
    expect(checkSigner({ ...base, shared: [C], method: 'personal_sign', params: ['0x00', C] })).toEqual({ ok: false, address: C });
  });

  it('Solana : compte de la session dans le portefeuille', () => {
    expect(checkSigner({ ...base, ns: 'solana', shared: ['SolB'], method: 'solana_signMessage', params: {} })).toEqual({ ok: false, address: 'SolB', switchTo: accounts[1] });
    expect(checkSigner({ ...base, ns: 'solana', shared: ['SolA', 'SolB'], method: 'solana_signMessage', params: {} })).toEqual({ ok: true });
  });

  it('session sans compte pour ce réseau : rien à vérifier', () => {
    expect(checkSigner({ ...base, shared: [], method: 'personal_sign', params: ['0x00', B] })).toEqual({ ok: true });
  });
});
