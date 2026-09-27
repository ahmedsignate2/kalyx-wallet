import { beginCell, storeStateInit, Cell } from '@ton/core';
import KEYS from '../chains/ton/tonkeeper-vectors.json';
import { jettonTransferBody } from '../chains/ton/tonJettons';
import { parseSendTransaction, totalOut, TC_ERROR } from './requests';

const art = KEYS.keys.find((k) => k.phrase.endsWith(' art'))!;
const ctx = { address: art.v5r1.uq, testnet: false, nowSeconds: 1_790_000_000 };
const DEST_EQ = KEYS.keys[4].v4r2.eq; // rebondissante
const DEST_UQ = KEYS.keys[3].v5r1.uq; // non rebondissante
const req = (o: object) => JSON.stringify({ valid_until: 1_790_000_300, network: '-239', from: art.v5r1.raw, ...o });

describe('sendTransaction', () => {
  it('lit une requête STON.fi typique : corps et rebond selon l’adresse', () => {
    const body = jettonTransferBody({ amount: 5n, to: DEST_UQ, responseTo: art.v5r1.uq, queryId: 1n }).toBoc().toString('base64');
    const r = parseSendTransaction(req({ messages: [{ address: DEST_EQ, amount: '50000000', payload: body }, { address: DEST_UQ, amount: '1' }] }), ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tx.messages[0]).toMatchObject({ amount: 50_000_000n, bounce: true });
    expect(r.tx.messages[0].payload!.hash().toString('hex')).toBe(Cell.fromBase64(body).hash().toString('hex'));
    expect(r.tx.messages[1]).toMatchObject({ bounce: false, payload: undefined });
    expect(totalOut(r.tx)).toBe(50_000_001n);
  });

  it('accepte un stateInit (déploiement de contrat) en base64 url', () => {
    const init = beginCell().store(storeStateInit({ code: beginCell().storeUint(1, 8).endCell(), data: beginCell().endCell() })).endCell();
    const b64url = init.toBoc().toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
    const r = parseSendTransaction(req({ messages: [{ address: DEST_EQ, amount: '1', stateInit: b64url }] }), ctx);
    expect(r.ok && r.tx.messages[0].init?.code?.hash().equals(init.beginParse().loadRef().hash())).toBe(true);
  });

  it.each([
    ['requête expirée', { valid_until: 1_789_999_999 }],
    ['autre réseau', { network: '-3' }],
    ['autre expéditeur', { from: KEYS.keys[3].v5r1.raw }],
    ['adresse brute', { messages: [{ address: KEYS.keys[3].v5r1.raw, amount: '1' }] }],
    ['montant non entier', { messages: [{ address: DEST_EQ, amount: '1.5' }] }],
    ['montant négatif', { messages: [{ address: DEST_EQ, amount: '-1' }] }],
    ['cinq messages', { messages: Array(5).fill({ address: DEST_EQ, amount: '1' }) }],
    ['aucun message', { messages: [] }],
    ['payload corrompu', { messages: [{ address: DEST_EQ, amount: '1', payload: 'pas-un-boc' }] }],
  ])('refuse : %s', (_n, o) => {
    const r = parseSendTransaction(req(o), ctx);
    expect(r).toMatchObject({ ok: false, code: TC_ERROR.BAD_REQUEST });
  });

  it('refuse proprement ce que Kalyx ne sait pas faire', () => {
    expect(parseSendTransaction(req({ items: [{ type: 'ton' }] }), ctx)).toMatchObject({ ok: false, code: TC_ERROR.METHOD_NOT_SUPPORTED });
    expect(parseSendTransaction(req({ messages: [{ address: DEST_EQ, amount: '1', extra_currency: { 100: '5' } }] }), ctx)).toMatchObject({ ok: false, code: TC_ERROR.METHOD_NOT_SUPPORTED });
  });

  it('échéance en millisecondes ramenée en secondes', () => {
    const r = parseSendTransaction(req({ valid_until: 1_790_000_300_000, messages: [{ address: DEST_EQ, amount: '1' }] }), ctx);
    expect(r.ok && r.tx.validUntil).toBe(1_790_000_300);
  });
});
