import { parseQr } from './parse';
import { describeQr, sendIntentFor, qrTargetFamily } from './route';

const A = 'UQDYzZmfsrGzhObKJUw4gzdeIxEai3jAFbiGKGwxvxHinf4K';
const USDT = 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs';

/* Exemples tirés de la spec « Deep links » (docs.ton.org). */
describe('TON Pay (ton://transfer)', () => {
  it('TON avec montant et commentaire', () => {
    const r = parseQr(`ton://transfer/${A}?amount=5000000&text=hello`);
    expect(r).toEqual({ kind: 'ton-uri', address: A, amountRaw: '5000000', text: 'hello' });
    expect(qrTargetFamily(r)).toBe('ton');
    expect(sendIntentFor(r)).toEqual({ to: A, amountRaw: '5000000', memo: 'hello', jetton: undefined, expiresAt: undefined });
    expect(describeQr(r, (k) => k).detail).toContain('0.005 TON');
  });

  it('USD₮ : jetton, montant en micro-unités, échéance', () => {
    const r = parseQr(`ton://transfer/${A}?jetton=${USDT}&amount=5000&text=Commande%20%2342&exp=2147483647`);
    expect(r).toMatchObject({ kind: 'ton-uri', jetton: USDT, amountRaw: '5000', text: 'Commande #42', exp: 2147483647 });
    expect(sendIntentFor(r)).toMatchObject({ jetton: USDT, amountRaw: '5000', memo: 'Commande #42', expiresAt: 2147483647 });
  });

  it('liens https de wallets : même demande', () => {
    for (const p of ['https://app.tonkeeper.com/transfer/', 'https://my.tt/transfer/', 'https://tonhub.com/transfer/']) {
      expect(parseQr(`${p}${A}?amount=1`)).toMatchObject({ kind: 'ton-uri', address: A, amountRaw: '1' });
    }
  });

  it('corps opaque (bin) : aucune action proposée, jamais signé à l’aveugle', () => {
    const r = parseQr(`ton://transfer/${A}?amount=5000000&bin=te6cckEBAQEAAgAAAEysuc0%3D`);
    expect(describeQr(r, (k) => k)).toMatchObject({ title: 'qrTonBlind', cta: null, danger: true });
    expect(sendIntentFor(r)).toBeNull();
  });

  it('refuse ce qui est mal formé', () => {
    expect(parseQr(`ton://transfer/${A}?amount=1.5`).kind).toBe('invalid');
    expect(parseQr(`ton://transfer/pas-une-adresse`).kind).toBe('invalid');
    expect(parseQr(`ton://transfer/${A}?jetton=nope`).kind).toBe('invalid');
  });

  it('adresse TON nue', () => {
    expect(parseQr(A)).toEqual({ kind: 'ton-address', address: A });
  });
});
