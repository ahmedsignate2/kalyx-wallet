import { summarizeTypedData } from './message';
import { explainRequest } from './explain';

const MAX160 = (2n ** 160n - 1n).toString();
const MAX48 = (2n ** 48n - 1n).toString();

describe('signatures « drainer » : jamais présentées comme bénignes', () => {
  it('Permit2 PermitBatch (details en tableau) : illimité et sans expiration → danger', () => {
    const t = summarizeTypedData({
      domain: { name: 'Permit2', chainId: 1 },
      primaryType: 'PermitBatch',
      message: { details: [{ token: '0xa', amount: '5', expiration: '1' }, { token: '0xb', amount: MAX160, expiration: MAX48 }], spender: '0xbad', sigDeadline: '1' },
    });
    expect(t?.unlimited).toBe(true);
    const ex = explainRequest({ kind: 'typedData', typed: t, connectedChainId: 1 });
    expect(ex.risk).toBe('danger');
    expect(ex.holdToSign).toBe(true);
  });
  it('PermitTransferFrom (permitted) : montant lu', () => {
    const t = summarizeTypedData({ domain: { name: 'Permit2' }, primaryType: 'PermitTransferFrom', message: { permitted: { token: '0xt', amount: MAX160 }, spender: '0xbad', deadline: '1' } });
    expect(t?.unlimited).toBe(true);
    expect(t?.token).toBe('0xt');
  });
  it('permis DAI (allowed: true, expiry: 0) → illimité, danger', () => {
    const t = summarizeTypedData({ domain: { name: 'Dai Stablecoin', verifyingContract: '0xdai' }, primaryType: 'Permit', message: { holder: '0xme', spender: '0xbad', nonce: 0, expiry: 0, allowed: true } });
    expect(t?.unlimited).toBe(true);
    expect(explainRequest({ kind: 'typedData', typed: t }).risk).toBe('danger');
  });
  it('ordre Seaport → danger', () => {
    const t = summarizeTypedData({ domain: { name: 'Seaport' }, primaryType: 'OrderComponents', message: { offer: [{}], consideration: [{}] } });
    const ex = explainRequest({ kind: 'typedData', typed: t });
    expect(ex.risk).toBe('danger');
    expect(ex.reasons).toContain('exTypedNftOrder');
  });
  it('transaction non simulée avec de la valeur : montant montré, plus « aucun risque »', () => {
    const ex = explainRequest({ kind: 'tx', simulation: null, txValue: 5n * 10n ** 18n, nativeSymbol: 'ETH' });
    expect(ex.risk).toBe('warning');
    expect(ex.lose[0]).toContain('5');
  });
});

describe('signatures : ni faux négatif, ni fausse alarme', () => {
  const MAX256 = (2n ** 256n - 1n).toString();
  it('un `details` factice ne masque pas un `value` illimité', () => {
    const t = summarizeTypedData({ domain: { name: 'Token' }, primaryType: 'Permit', message: { spender: '0xbad', value: MAX256, deadline: '1', details: { amount: '1' } } });
    expect(t?.unlimited).toBe(true);
  });
  it('permis DAI avec allowed: 1 → illimité ; révocation (allowed: false) → pas de danger', () => {
    expect(summarizeTypedData({ primaryType: 'Permit', domain: { name: 'Dai' }, message: { spender: '0xbad', allowed: 1, expiry: 99 } })?.unlimited).toBe(true);
    const revoke = summarizeTypedData({ primaryType: 'Permit', domain: { name: 'Dai' }, message: { spender: '0xx', allowed: false, expiry: 0 } });
    expect(explainRequest({ kind: 'typedData', typed: revoke }).risk).not.toBe('danger');
  });
  it('entrée nulle dans details : pas de plantage', () => {
    expect(() => summarizeTypedData({ primaryType: 'PermitBatch', message: { details: [null], spender: '0x1' } })).not.toThrow();
  });
  it('ordre de DEX (CoW, 1inch) : pas classé comme ordre NFT', () => {
    const t = summarizeTypedData({ domain: { name: 'Gnosis Protocol' }, primaryType: 'Order', message: { sellToken: '0xa', buyToken: '0xb' } });
    expect(t?.order).toBe(false);
    expect(explainRequest({ kind: 'typedData', typed: t }).reasons).not.toContain('exTypedNftOrder');
  });
  it('simulation en cours : pas d’avertissement provisoire', () => {
    expect(explainRequest({ kind: 'tx', simulation: null, simulating: true, txValue: 10n ** 18n }).risk).toBe('none');
  });
});
