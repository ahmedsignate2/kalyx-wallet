import { Cell } from '@ton/core';
import live from './tonapi-jettons-live.json';
import vectors from './ton-jetton-transfer-vectors.json';
import { jettonImageUrl, jettonTransferBody, parseJettonBalances, USDT_TON_MASTER } from './tonJettons';

describe('parseJettonBalances (réponse TonAPI réelle)', () => {
  const list = parseJettonBalances(live.jettons, 'eur');

  it('écarte les jetons en liste noire, même quand leur symbole imite USD₮', () => {
    expect(list.some((j) => j.verification === 'blacklist')).toBe(false);
    const usdt = list.filter((j) => j.symbol === 'USD₮');
    expect(usdt).toHaveLength(1);
    expect(usdt[0].master).toBe(USDT_TON_MASTER);
    expect(usdt[0].verification).toBe('whitelist');
  });

  it('garde les jetons non vérifiés, marqués comme tels (le faux « Tethe USD »)', () => {
    const fake = list.find((j) => j.symbol === 'USDT-GARN');
    expect(fake?.verification).toBe('none');
  });

  it('lit montants exacts, décimales, portefeuille de jeton et prix', () => {
    const usdt = list.find((j) => j.master === USDT_TON_MASTER)!;
    expect(usdt.raw).toBe(1060n);
    expect(usdt.decimals).toBe(6);
    expect(usdt.wallet).toMatch(/^0:[0-9a-f]{64}$/);
    expect(usdt.price).toBeGreaterThan(0.5);
    const not = list.find((j) => j.symbol === 'NOT')!;
    expect(not.raw).toBe(43988317111756n);
  });

  it('convertit l’image WebP en PNG', () => {
    expect(list.every((j) => !j.image || !/\.webp/.test(j.image) || j.image.includes('output=png'))).toBe(true);
    expect(jettonImageUrl('https://x.io/a.png')).toBe('https://x.io/a.png');
    expect(jettonImageUrl('http://x.io/a.png')).toBeUndefined();
  });

  it('résiste à une réponse vide ou abîmée', () => {
    expect(parseJettonBalances(null, 'eur')).toEqual([]);
    expect(parseJettonBalances({ balances: [{ balance: '1', jetton: {} }] }, 'eur')).toEqual([]);
  });
});

/** Texte d'un commentaire TON (op 0 + chaîne). */
function commentOf(boc: string): string {
  const s = Cell.fromBase64(boc).beginParse();
  expect(s.loadUint(32)).toBe(0);
  return s.loadStringTail();
}

describe('jettonTransferBody (transferts réels sur la chaîne)', () => {
  // Les transferts « simples » : sans charge personnalisée, et sans charge
  // transmise ou avec un commentaire texte — ce que Kalyx envoie.
  const simple = vectors.transfers.filter((t) => {
    if (t.custom_payload !== null) return false;
    if (!t.forward_payload) return true;
    // Un commentaire VIDE (op 0 sans texte) : Kalyx n'en envoie jamais.
    try { return commentOf(t.forward_payload) !== ''; } catch { return false; }
  });

  it('dispose de transferts réels à comparer', () => {
    expect(simple.length).toBeGreaterThanOrEqual(3);
  });

  it.each(simple.map((t) => [t.tx, t] as const))('redonne le corps exact de %s', (_tx, t) => {
    const onChain = Cell.fromBase64(t.body);
    const ours = jettonTransferBody({
      queryId: BigInt(t.query_id),
      amount: BigInt(t.amount),
      to: t.destination,
      responseTo: t.response_destination,
      forwardTon: BigInt(t.forward_ton_amount),
      comment: t.forward_payload ? commentOf(t.forward_payload) : undefined,
    });
    expect(ours.hash().toString('hex')).toBe(onChain.hash().toString('hex'));
  });

  it('refuse un montant nul et un query_id hors limites', () => {
    const base = { to: vectors.transfers[0].destination, responseTo: vectors.transfers[0].response_destination };
    expect(() => jettonTransferBody({ ...base, amount: 0n, queryId: 1n })).toThrow();
    expect(() => jettonTransferBody({ ...base, amount: 1n, queryId: 1n << 64n })).toThrow();
  });
});
