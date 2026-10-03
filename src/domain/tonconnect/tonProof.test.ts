import { hex } from '@scure/base';
import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { Address, Cell, loadStateInit, contractAddress } from '@ton/core';
import KEYS from '../chains/ton/tonkeeper-vectors.json';
import { tonWalletStateInitBoc } from '../chains/ton/tonTransfer';
import { buildTonProof, tonAddrReply, tonProofDigest, tonProofMessage, TON_MAINNET_ID } from './tonProof';

const art = KEYS.keys.find((k) => k.phrase.endsWith(' art'))!;

/** Copie conforme de `tonConnectProofPayload` (tonkeeper-web, connectService.ts) + sha256 de signTonConnectOver. */
function tonkeeperDigest(timestamp: number, domain: string, wallet: string, payload: string): Uint8Array {
  const timestampBuffer = Buffer.allocUnsafe(8);
  timestampBuffer.writeBigInt64LE(BigInt(timestamp));
  const domainBuffer = Buffer.from(domain);
  const domainLengthBuffer = Buffer.allocUnsafe(4);
  domainLengthBuffer.writeInt32LE(domainBuffer.byteLength);
  const address = Address.parse(wallet);
  const wc = Buffer.allocUnsafe(4);
  wc.writeInt32BE(address.workChain);
  const messageBuffer = Buffer.concat([Buffer.from('ton-proof-item-v2/', 'utf8'), wc, address.hash, domainLengthBuffer, domainBuffer, timestampBuffer, Buffer.from(payload)]);
  const bufferToSign = Buffer.concat([Buffer.from('ffff', 'hex'), Buffer.from('ton-connect', 'utf8'), Buffer.from(sha256(messageBuffer))]);
  return sha256(bufferToSign);
}

describe('ton_proof', () => {
  it.each([
    ['app.ston.fi', '4aae783bef4b360d000000006ab950d28dee254227bd044211e285f80858eac8'],
    ['dedust.io', 'é unicode payload'],
    ['ton.org', ''],
  ])('mêmes octets signés que Tonkeeper (%s)', (domain, payload) => {
    const ts = 1790527000;
    expect(hex.encode(tonProofDigest(tonProofMessage(art.v5r1.uq, domain, ts, payload)))).toBe(hex.encode(tonkeeperDigest(ts, domain, art.v5r1.uq, payload)));
  });

  it('disposition : préfixe, workchain BE, domaine LE, horodatage LE, payload', () => {
    const m = tonProofMessage('0:' + '11'.repeat(32), 'a.io', 0x0102030405, 'p');
    expect(new TextDecoder().decode(m.subarray(0, 18))).toBe('ton-proof-item-v2/');
    expect(hex.encode(m.subarray(18, 22))).toBe('00000000');
    expect(hex.encode(m.subarray(54, 58))).toBe('04000000');
    expect(new TextDecoder().decode(m.subarray(58, 62))).toBe('a.io');
    expect(hex.encode(m.subarray(62, 70))).toBe('0504030201000000');
    expect(new TextDecoder().decode(m.subarray(70))).toBe('p');
  });

  it('la signature se vérifie avec la clé publique du compte', async () => {
    const reply = await buildTonProof({ address: art.v5r1.uq, domain: 'app.ston.fi', payload: 'nonce', timestamp: 1790527000 }, (d) => ed25519.sign(d, hex.decode(art.seed)));
    expect(reply.proof.domain).toEqual({ lengthBytes: 11, value: 'app.ston.fi' });
    const digest = tonProofDigest(tonProofMessage(art.v5r1.uq, 'app.ston.fi', 1790527000, 'nonce'));
    expect(ed25519.verify(Buffer.from(reply.proof.signature, 'base64'), digest, hex.decode(art.publicKey))).toBe(true);
  });
});

describe('ton_addr', () => {
  it('adresse brute, réseau principal, et un StateInit qui redonne l’adresse', () => {
    const r = tonAddrReply({ address: art.v5r1.uq, testnet: false, publicKeyHex: art.publicKey, stateInitBoc: tonWalletStateInitBoc(hex.decode(art.publicKey), 'v5r1') });
    expect(r.address).toBe(art.v5r1.raw);
    expect(r.network).toBe(TON_MAINNET_ID);
    const init = loadStateInit(Cell.fromBase64(r.walletStateInit).beginParse());
    // Ce que fait un vérificateur (spec) : contractAddress(stateInit) === address.
    expect(contractAddress(0, init).toRawString()).toBe(art.v5r1.raw);
  });
});
