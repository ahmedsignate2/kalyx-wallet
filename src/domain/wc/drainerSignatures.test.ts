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
