/**
 * Transferts TON : mêmes octets que les bibliothèques officielles.
 *
 * `ton-transfer-vectors.json` a été produit par `@ton/ton` 16.3.0, `@ton/core`
 * 0.63.1 et le VRAI `@ton/crypto` 3.3.0 — pas par notre substitut
 * (`tonCoreCrypto.ts`) : les BOC attendus ne dépendent donc de rien de ce qui
 * est testé ici. ed25519 étant déterministe, un BOC identique veut dire la même
 * signature, le même corps, le même état initial, le même message.
 *
 * Clés : vecteur officiel #0 de `@ton/crypto`, et la phrase de test BIP-39
 * « abandon × 23 art », dont l'adresse W5 a été confirmée dans Tonkeeper.
 */
import { Cell } from '@ton/core';
import { hex } from '@scure/base';
import type { Ed25519Signer } from '../v2/signer';
import { Address } from '@ton/core';
import { buildTonTransfer, normalizedExternalHash, TON_SEND_MODE_ALL, TON_SEND_MODE_DEFAULT, type TonTransferParams } from './tonTransfer';
import LIVE from './ton-live-message.json';
import { TON_WALLET_CODE } from './tonWalletCode';
import { tonWalletAddress, type TonWalletVersion } from './tonWallet';
import TX from './ton-transfer-vectors.json';
import KEYS from './tonkeeper-vectors.json';

const seedOf = (publicKey: string) => KEYS.keys.find((k) => k.publicKey === publicKey)!.seed;
const signerFor = (publicKey: string): Ed25519Signer => ({ curve: 'ed25519', secretKey: hex.decode(seedOf(publicKey)), publicKey: hex.decode(publicKey) });

const paramsOf = (t: (typeof TX.transfers)[number]): TonTransferParams => ({
  version: t.version as TonWalletVersion,
  seqno: t.seqno,
  validUntil: t.validUntil,
  deploy: t.deploy,
  testnet: !!(t as { testnet?: boolean }).testnet,
  sendMode: t.sendMode,
  messages: t.messages.map((m) => ({ to: m.to, amount: BigInt(m.amount), bounce: m.bounce, comment: (m as { comment?: string }).comment })),
});

describe('buildTonTransfer — octet pour octet avec @ton/ton', () => {
  it.each(TX.transfers.map((t) => [t.name, t]))('%s', (_, t) => {
    const out = buildTonTransfer(paramsOf(t), signerFor(t.publicKey));
    expect(out.boc).toBe(t.boc);
    expect(out.hash).toBe(t.hash);
    expect(out.from).toBe(t.from);
  });

  it('les modes exportés sont ceux des vecteurs', () => {
    expect(TON_SEND_MODE_DEFAULT).toBe(3);
    expect(TON_SEND_MODE_ALL).toBe(128);
  });
});

describe('code des contrats', () => {
  /*
   * Le code sert au déploiement, le hachage du code à l'adresse. S'ils ne
   * correspondaient pas, le premier envoi déploierait un AUTRE compte que celui
   * affiché — et serait refusé.
   */
  it.each(Object.keys(TON_WALLET_CODE) as TonWalletVersion[])('%s : le code redonne le hachage des adresses', (v) => {
    const code = Cell.fromBase64(TON_WALLET_CODE[v]);
    expect(code.hash().toString('hex')).toBe(TX.code[v].hash);
    expect(code.depth()).toBe(TX.code[v].depth);
  });
});

describe('refus', () => {
  const base = TX.transfers[0];
  const signer = () => signerFor(base.publicKey);
  const p = (over: Partial<TonTransferParams>): TonTransferParams => ({ ...paramsOf(base), ...over });

  it('une échéance en millisecondes', () => {
    expect(() => buildTonTransfer(p({ validUntil: Date.now() }), signer())).toThrow(/SECONDES/);
  });
  it('un déploiement avec un seqno non nul', () => {
    expect(() => buildTonTransfer(p({ deploy: true, seqno: 5 }), signer())).toThrow(/seqno 0/);
  });
  it('une adresse du réseau de test sur le réseau principal', () => {
    const testnetAddr = KEYS.keys[3].v5r1Testnet.uq;
    expect(() => buildTonTransfer(p({ messages: [{ to: testnetAddr, amount: 1n, bounce: false }] }), signer())).toThrow(/réseau de test/);
  });
  it('une clé de signature qui n’est pas celle du compte', () => {
    const other = signerFor(KEYS.keys[1].publicKey);
    expect(() => buildTonTransfer(p({}), { ...other, publicKey: hex.decode(base.publicKey) })).toThrow(/ne correspond pas/);
  });
  it('trop ou pas assez de messages', () => {
    const one = { to: KEYS.keys[3].v5r1.uq, amount: 1n, bounce: false };
    expect(() => buildTonTransfer(p({ messages: [] }), signer())).toThrow(/Entre 1 et/);
    expect(() => buildTonTransfer(p({ version: 'v4r2', messages: [one, one, one, one, one] }), signer())).toThrow(/Entre 1 et 4/);
  });
  it('un montant négatif ou une adresse illisible', () => {
    expect(() => buildTonTransfer(p({ messages: [{ to: KEYS.keys[3].v5r1.uq, amount: -1n, bounce: false }] }), signer())).toThrow(/Montant/);
    expect(() => buildTonTransfer(p({ messages: [{ to: 'pas une adresse', amount: 1n, bounce: false }] }), signer())).toThrow(/invalide/);
  });
  it('accepte une adresse brute', () => {
    const raw = KEYS.keys[3].v5r1.raw;
    expect(() => buildTonTransfer(p({ messages: [{ to: raw, amount: 1n, bounce: false }] }), signer())).not.toThrow();
  });
});

describe('cohérence avec tonWallet.ts', () => {
  it('l’émetteur est l’adresse calculée pour la clé et la version', () => {
    const t = TX.transfers[1];
    const out = buildTonTransfer(paramsOf(t), signerFor(t.publicKey));
    expect(out.from).toBe(KEYS.keys.find((k) => k.publicKey === t.publicKey)!.v5r1.uq);
    expect(tonWalletAddress(hex.decode(t.publicKey), 'v5r1')).toBeTruthy();
  });
});

/*
 * Le hachage NORMALISÉ (TEP-467) sert d'identifiant de transaction : c'est sous
 * lui que TON Center et les explorateurs indexent un message externe. Vérifié
 * contre une transaction RÉELLE, et non contre une autre implémentation : le
 * `hash_norm` ci-dessous vient de l'indexeur.
 */
describe('hachage normalisé — contre le réseau', () => {
  it('reproduit le hash_norm indexé par TON Center pour une transaction réelle', () => {
    const got = normalizedExternalHash(Address.parseRaw(LIVE.destination.toLowerCase()), Cell.fromBase64(LIVE.body));
    expect(got.toString('base64')).toBe(LIVE.hash_norm);
  });

  it('chaque transfert construit porte son hachage normalisé', () => {
    const t = TX.transfers[0];
    const out = buildTonTransfer(paramsOf(t), signerFor(t.publicKey));
    expect(out.normalizedHash).toMatch(/^[0-9a-f]{64}$/);
    expect(out.normalizedHash).not.toBe(out.hash); // le message envoyé embarque l'état initial : autre cellule
  });
});

