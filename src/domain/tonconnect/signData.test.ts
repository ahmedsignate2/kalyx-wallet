import { ed25519 } from '@noble/curves/ed25519';
import { base64, hex } from '@scure/base';
import { Address } from '@ton/core';
import { crc32, encodeDnsName, parseSignDataPayload, signDataDigest } from './signData';

/*
 * VECTEURS produits par l'implémentation de RÉFÉRENCE (mois-ilya/sign-data-reference,
 * reprise par Tonkeeper), exécutée telle quelle avec une clé fixe (graine 32 × 0x07)
 * et l'horodatage 1703980800. Nos signatures doivent être identiques à l'octet près.
 */
const SEED = new Uint8Array(32).fill(7);
const ADDRESS = Address.parse('UQCyqTmXJpshFu1GW1tyTX6paa3c-37OG9s3uv8ZzX_9GDfx');
const TS = 1703980800;
const REF = {
  publicKey: 'ea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c',
  text: '3vVCBcDjDmP4jPUHx6r/0fAmx2OIlziUamYOvS0Zk3OYefdg9PkR/igb0mogxR+2b+ryE4ni/70zhTa+XDikAw==',
  binary: 'UT1owqFqA1KohlKUzsQvSTuxer1b13CSv5yP8fcXpdd+6uMC44h3pUl+/umSyHvT9LKsgShBmpbwlV7ZrZMiAw==',
  cell: 'pY8to2wJRR/beKqkc+O+fms+SlRgEbgtCCLq7l3DW3cW1koWXBmDOoSPUoQgvGJTSSf00cInyEx7PLYTLIXJAA==',
  cellBoc: 'te6cckEBAQEACwAAEgAAACpoZWxsb8ujFEc=',
};
const sign = (d: Uint8Array) => base64.encode(ed25519.sign(d, SEED));

describe('TON Connect signData : identique à l’implémentation de référence', () => {
  it('clé de test', () => {
    expect(hex.encode(ed25519.getPublicKey(SEED))).toBe(REF.publicKey);
  });
  it('texte (UTF-8, accents, emoji)', () => {
    expect(sign(signDataDigest({ type: 'text', text: 'Hello, TON! Été 🌞' }, ADDRESS, 'app.ston.fi', TS))).toBe(REF.text);
  });
  it('binaire', () => {
    expect(sign(signDataDigest({ type: 'binary', bytes: base64.encode(new Uint8Array([1, 2, 3, 250])) }, ADDRESS, 'example.com', TS))).toBe(REF.binary);
  });
  it('cellule (CRC32 du schéma, domaine TEP-81)', () => {
    const d = signDataDigest({ type: 'cell', schema: 'message#_ value:uint32 text:Cell = Message;', cell: REF.cellBoc }, ADDRESS, 'ton-connect.github.io', TS);
    expect(sign(d)).toBe(REF.cell);
  });
  it('outils : CRC32, domaine DNS, demandes mal formées refusées', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect(encodeDnsName('App.Ston.fi')).toBe('fi\0ston\0app\0');
    expect(parseSignDataPayload('{"type":"text","text":"hi","network":"-239"}')).toEqual({ type: 'text', text: 'hi', network: '-239' });
    expect(parseSignDataPayload('{"type":"binary","bytes":"@@@"}')).toBeNull();
    expect(parseSignDataPayload('{"type":"cell","schema":"x","cell":"pas une cellule"}')).toBeNull();
    expect(parseSignDataPayload('{"type":"autre"}')).toBeNull();
    expect(parseSignDataPayload('pas du json')).toBeNull();
  });
});
