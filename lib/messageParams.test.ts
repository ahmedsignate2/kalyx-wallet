import { bitcoinMessageParam, btcFromSats, btcTransferParams, solanaMessageParam } from './messageParams';

describe('btcFromSats — la dApp parle en satoshis', () => {
  it('convertit sans perte', () => {
    expect(btcFromSats('100000')).toBe('0.001');
    expect(btcFromSats('1')).toBe('0.00000001');
    expect(btcFromSats(250_000_000)).toBe('2.5');
    expect(btcFromSats('100000000')).toBe('1');
  });
  it('refuse décimal, négatif, zéro, vide', () => {
    for (const bad of ['0.001', '-5', '0', '', undefined, '1e8', 1.5]) expect(() => btcFromSats(bad)).toThrow();
  });
});

describe('paramètres de message — une seule lecture', () => {
  it('Bitcoin [adresse, message] : le message, pas l’adresse', () => {
    expect(bitcoinMessageParam(['bc1qxyz', 'Hello'])).toBe('Hello');
    expect(bitcoinMessageParam({ message: 'Hi' })).toBe('Hi');
  });
  it('Solana : message, msg ou signMessage', () => {
    expect(solanaMessageParam({ signMessage: 'abc' })).toBe('abc');
    expect(solanaMessageParam([{ message: 'm' }])).toBe('m');
    expect(solanaMessageParam({})).toBeUndefined();
  });
});

describe('btcTransferParams — l’écran et l’envoi lisent la même chose', () => {
  it('objet (spec) et tableau [adresse, montant]', () => {
    expect(btcTransferParams([{ recipientAddress: 'bc1qa', amount: '5000' }])).toEqual({ to: 'bc1qa', amount: '5000' });
    expect(btcTransferParams(['bc1qb', '7000'])).toEqual({ to: 'bc1qb', amount: '7000' });
  });
  it('champ vide : on passe au suivant, jamais une adresse vide', () => {
    expect(btcTransferParams({ recipientAddress: '', recipient: 'bc1qc', amount: 1 }).to).toBe('bc1qc');
    expect(btcTransferParams({}).to).toBeUndefined();
  });
});
