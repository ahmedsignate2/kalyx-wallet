import { Address, beginCell, Cell } from '@ton/core';
import { buildSwapMessage, getStonfiQuote, tonSwapPaysUser, verifyTonSwap, PTON_V2_1_MASTER, TON_FEE_RECIPIENT } from './stonfi';
import { checkSwapQuote } from './guard';

/*
 * VECTEURS produits par le SDK OFFICIEL (@ston-fi/sdk 2.7, DEX v2.2, pTON v2.1),
 * exécuté hors ligne avec les mêmes paramètres (échéance 1790000900, parrainage
 * 30 points de base vers {TON_FEE_RECIPIENT}). Nos messages doivent être
 * identiques : même destination, mêmes TON joints, même cellule.
 */
const REF = {
 "tonToUsdt": {
  "to": "0:9220c181a6cfeacd11b7b8f62138df1bb9cc82b6ed2661d2f5faee204b3efb20",
  "amount": "1310000000",
  "payload": "te6cckEBAwEA9QABZAHzg10AAAAAAAAAAEO5rKAIAWm2jY70SlVWWHgIPAltrcsyMTpUif8M5BpP3lbIR+hfAQHhZmTeKoASRaxPr7HbegHJxHe2GKlO3cvD6MrnQ16ILwr/R8R9I/AC020bHeiUqqyw8BB4EttblmRidKkT/hnINJ+8rZCP0L4AWm2jY70SlVWWHgIPAltrcsyMTpUif8M5BpP3lbIR+heAAAAANVifgkACAJMxgzMIAWm2jY70SlVWWHgIPAltrcsyMTpUif8M5BpP3lbIR+heAAAPQAWqSrUIIUceVodVqbHA2zTR/ZCyKXXfPa0sTFORCQplSF0subw="
 },
 "usdtToTon": {
  "to": "0:abababababababababababababababababababababababababababababababab",
  "amount": "300000000",
  "payload": "te6cckECAwEAARsAAa4Pin6lAAAAAAAAAAA0xLQIASXCgjXKjRJeZ2WRUT1SByGx/pn3ci9Mh3I85+4N+3OjAC020bHeiUqqyw8BB4EttblmRidKkT/hnINJ+8rZCP0LyBycOAEBAeFmZN4qgBJEGDA02f1Zojb3HsQnG+N3OZBW3aTMOl6/XcQJZ99kEALTbRsd6JSqrLDwEHgS21uWZGJ0qRP+Gcg0n7ytkI/QvgBabaNjvRKVVZYeAg8CW2tyzIxOlSJ/wzkGk/eVshH6F4AAAAA1WJ+CQAIAlUstBeAIAWm2jY70SlVWWHgIPAltrcsyMTpUif8M5BpP3lbIR+heAAAPQAWqSrUIIUceVodVqbHA2zTR/ZCyKXXfPa0sTFORCQplSD5IUJ0="
 },
 "usdtToNot": {
  "to": "0:abababababababababababababababababababababababababababababababab",
  "amount": "300000000",
  "payload": "te6cckECAwEAARwAAa4Pin6lAAAAAAAAAAA0xLQIASXCgjXKjRJeZ2WRUT1SByGx/pn3ci9Mh3I85+4N+3OjAC020bHeiUqqyw8BB4EttblmRidKkT/hnINJ+8rZCP0LyBycOAEBAeFmZN4qgBm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5ubm5sALTbRsd6JSqrLDwEHgS21uWZGJ0qRP+Gcg0n7ytkI/QvgBabaNjvRKVVZYeAg8CW2tyzIxOlSJ/wzkGk/eVshH6F4AAAAA1WJ+CQAIAl1ovtAWACAFpto2O9EpVVlh4CDwJba3LMjE6VIn/DOQaT95WyEfoXgAAD0AFqkq1CCFHHlaHVamxwNs00f2Qsil13z2tLExTkQkKZUiExWud"
 }
} as const;
const USER = 'UQC020bHeiUqqyw8BB4EttblmRidKkT_hnINJ-8rZCP0L1Dw';
const ROUTER = 'EQCS4UEa5UaJLzOyyKieqQOQ2P9M-7kXpkO5HnP3Bv250cN3';
const PTON_W = 'EQCSIMGBps_qzRG3uPYhON8bucyCtu0mYdL1-u4gSz77IBa3';
const USDT_W_ROUTER = 'EQCSLWJ9fY7b0A5OI72wxUp27l4fRlc6GvRBeFf6PiPpH4p3';
const USER_USDT_W = '0:' + 'ab'.repeat(32);
const NOW = 1790000000;
const same = (m: { to: string; amount: bigint; payload: string }, ref: { to: string; amount: string; payload: string }) => {
  expect(Address.parse(m.to).toRawString()).toBe(ref.to);
  expect(m.amount.toString()).toBe(ref.amount);
  expect(Cell.fromBase64(m.payload).hash().toString('hex')).toBe(Cell.fromBase64(ref.payload).hash().toString('hex'));
};

describe('STON.fi : messages identiques au SDK officiel', () => {
  it('TON → USDT (pTON)', () => {
    same(buildSwapMessage({ user: USER, router: ROUTER, offerIsTon: true, offerJettonWallet: PTON_W, askJettonWallet: USDT_W_ROUTER, askIsTon: false, offerAmount: 1_000_000_000n, minAskAmount: 1585968n, nowSeconds: NOW }), REF.tonToUsdt);
  });
  it('USDT → TON', () => {
    same(buildSwapMessage({ user: USER, router: ROUTER, offerIsTon: false, offerJettonWallet: USER_USDT_W, askJettonWallet: PTON_W, askIsTon: true, offerAmount: 5_000_000n, minAskAmount: 3_000_000_000n, nowSeconds: NOW }), REF.usdtToTon);
  });
  it('USDT → autre jeton', () => {
    same(buildSwapMessage({ user: USER, router: ROUTER, offerIsTon: false, offerJettonWallet: USER_USDT_W, askJettonWallet: '0:' + 'cd'.repeat(32), askIsTon: false, offerAmount: 5_000_000n, minAskAmount: 700_000_000_000n, nowSeconds: NOW }), REF.usdtToNot);
  });
});

describe('STON.fi : garde-fous', () => {
  const msg = buildSwapMessage({ user: USER, router: ROUTER, offerIsTon: false, offerJettonWallet: USER_USDT_W, askJettonWallet: PTON_W, askIsTon: true, offerAmount: 5_000_000n, minAskAmount: 1n, nowSeconds: NOW });
  it('le message relu paie bien l’utilisateur, et pas quelqu’un d’autre', () => {
    expect(tonSwapPaysUser(msg, USER, ROUTER)).toBe(true);
    expect(tonSwapPaysUser(msg, TON_FEE_RECIPIENT, ROUTER)).toBe(false);
    expect(tonSwapPaysUser(msg, USER, PTON_W)).toBe(false); // autre « routeur »
    const evil = buildSwapMessage({ user: TON_FEE_RECIPIENT, router: ROUTER, offerIsTon: true, offerJettonWallet: PTON_W, askJettonWallet: USDT_W_ROUTER, askIsTon: false, offerAmount: 1n, minAskAmount: 1n, nowSeconds: NOW });
    expect(tonSwapPaysUser(evil, USER, ROUTER)).toBe(false);
    expect(tonSwapPaysUser({ ...msg, payload: beginCell().storeUint(0xdeadbeef, 32).endCell().toBoc().toString('base64') }, USER, ROUTER)).toBe(false);
  });

  it('devis : routeur hors liste refusé ; montant incohérent refusé', async () => {
    const api = (over: object) => (async () => ({ ok: true, json: async () => ({ offer_units: '1000000000', ask_units: '1600000', min_ask_units: '1585968', offer_jetton_wallet: PTON_W, ask_jetton_wallet: USDT_W_ROUTER, router_address: ROUTER, router: { major_version: 2, pton_master_address: 'EQBnGWMCf3-FZZq1W4IWcWiGAc3PHuZ0_H-7sad2oY00o83S' }, ...over }) })) as unknown as typeof fetch;
    const base = { fromToken: 'ton', toToken: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs', fromAmount: 1_000_000_000n, fromAddress: USER, nowSeconds: NOW };
    const q = await getStonfiQuote(base, api({}));
    expect(q?.tx.type).toBe('ton');
    expect(q?.toAmountMin).toBe(1585968n);
    expect(q && checkSwapQuote(q, { fromToken: 'ton', fromAmount: 1_000_000_000n, fromAddress: USER, toAddress: USER })).toEqual({ ok: true });
    await expect(getStonfiQuote(base, api({ router_address: 'EQBnGWMCf3-FZZq1W4IWcWiGAc3PHuZ0_H-7sad2oY00o83S' }))).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    await expect(getStonfiQuote(base, api({ offer_units: '5' }))).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
  });

  it('échange depuis TON : le portefeuille pTON doit être celui du routeur, relu sur la chaîne', async () => {
    const tx = { messages: [{ ...buildSwapMessage({ user: USER, router: ROUTER, offerIsTon: true, offerJettonWallet: PTON_W, askJettonWallet: USDT_W_ROUTER, askIsTon: false, offerAmount: 1n, minAskAmount: 1n, nowSeconds: NOW }) }], router: Address.parse(ROUTER).toRawString(), ptonWallet: Address.parse(PTON_W).toRawString() };
    const ok = async (owner: string, master: string) => (Address.parse(owner).toRawString() === tx.router && master === PTON_V2_1_MASTER ? Address.parse(PTON_W).toRawString() : null);
    await expect(verifyTonSwap(tx, ok)).resolves.toBeUndefined();
    await expect(verifyTonSwap(tx, async () => '0:' + '11'.repeat(32))).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    await expect(verifyTonSwap({ ...tx, router: '0:' + '22'.repeat(32) }, ok)).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
  });
});
