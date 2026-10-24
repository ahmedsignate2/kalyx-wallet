import { checkSigner, requestedEvmSigner, requestedSigner } from './signerAccount';

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

describe('compagnon : plusieurs portefeuilles, toutes les familles', () => {
  const SOL_A = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
  const SOL_D = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
  const BTC_D = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
  const all = [
    { index: 0, label: 'Compte 1', walletId: 'w1', walletLabel: 'Portefeuille', evmAddress: A, solAddress: SOL_A },
    { index: 0, label: 'Compte 1', walletId: 'w2', walletLabel: 'Don evm', evmAddress: C, solAddress: SOL_D, btcAddress: BTC_D },
  ];

  it('signataire nommé en Solana (pubkey) et en Bitcoin (account)', () => {
    expect(requestedSigner('solana', 'solana_signTransaction', { transaction: 'x', pubkey: SOL_D })).toBe(SOL_D);
    expect(requestedSigner('bip122', 'sendTransfer', { account: BTC_D.toUpperCase(), recipientAddress: 'x', amount: '1' })).toBe(BTC_D);
    expect(requestedSigner('solana', 'solana_signTransaction', { transaction: 'x' })).toBeUndefined();
  });

  it('compte d’un AUTRE portefeuille du téléphone : proposé, avec son portefeuille', () => {
    const r = checkSigner({ ns: 'eip155', shared: [A, C], method: 'personal_sign', params: ['0x00', C], accounts: all, activeIndex: 0, activeWalletId: 'w1' });
    expect(r).toEqual({ ok: false, address: C, switchTo: all[1] });
  });

  it('Solana : la clé demandée décide (plus le premier compte partagé)', () => {
    expect(checkSigner({ ns: 'solana', shared: [SOL_A, SOL_D], method: 'solana_signMessage', params: { message: 'x', pubkey: SOL_A }, accounts: all, activeIndex: 0, activeWalletId: 'w1' })).toEqual({ ok: true });
    expect(checkSigner({ ns: 'solana', shared: [SOL_A, SOL_D], method: 'solana_signMessage', params: { message: 'x', pubkey: SOL_D }, accounts: all, activeIndex: 0, activeWalletId: 'w1' })).toEqual({ ok: false, address: SOL_D, switchTo: all[1] });
  });

  it('même index dans deux portefeuilles : le compte actif est celui du portefeuille actif', () => {
    expect(checkSigner({ ns: 'eip155', shared: [A, C], method: 'personal_sign', params: ['0x00', C], accounts: all, activeIndex: 0, activeWalletId: 'w2' })).toEqual({ ok: true });
  });
});

