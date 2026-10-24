/**
 * EFFACEMENT DES CLÉS : chaque signataire ouvert par l'extension est remis à
 * zéro après usage — y compris quand la demande échoue AVANT la signature
 * (PSBT illisible, réseau inconnu). On capture le signataire réel et on
 * vérifie ses octets après coup.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { ChainSigner } from '../../src/domain/chains/v2/signer';

const opened: ChainSigner[] = [];
vi.mock('./signer', async (importOriginal) => {
  const real = await importOriginal<typeof import('./signer')>();
  return { ...real, signerFor: async (...a: Parameters<typeof real.signerFor>) => { const s = await real.signerFor(...a); opened.push(s); return s; } };
});

const { makeSession } = await import('./session');
const { makeStore } = await import('./storage');
const { makeWallets } = await import('./wallets');
const { execute } = await import('./dappSign');

const ABOUT = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const BTC0 = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';
const EVM0 = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';
const secretOf = (s: ChainSigner) => (s.curve === 'secp256k1' ? s.privateKey : s.secretKey);
const area = () => {
  const data: Record<string, unknown> = {};
  return { async get(k: string[]) { return Object.fromEntries(k.filter((x) => x in data).map((x) => [x, structuredClone(data[x])])); }, async set(i: Record<string, unknown>) { Object.assign(data, structuredClone(i)); }, async remove(k: string[]) { for (const x of k) delete data[x]; } };
};

let session: ReturnType<typeof makeSession>;
let wallets: ReturnType<typeof makeWallets>;
let walletId: string;
beforeEach(async () => {
  opened.length = 0;
  const disk = makeStore(area());
  session = makeSession({ disk, session: makeStore(area()), alarms: { create() {}, clear() {} }, kdf: { N: 1 << 10, r: 8, p: 1 } });
  wallets = makeWallets(disk, session);
  await session.create('Plage-Orange-47!');
  walletId = (await wallets.importPhrase(ABOUT)).id;
});

describe('effacement des clés', () => {
  test('PSBT illisible : la demande échoue, la clé Bitcoin ouverte est quand même remise à zéro', async () => {
    await expect(execute({ kind: 'btcPsbt', from: BTC0, pub: '', psbt: 'pas-un-psbt', indexes: [0], send: false }, { walletId, index: 0 }, {}, { session, wallets })).rejects.toThrow();
    expect(opened).toHaveLength(1);
    expect(secretOf(opened[0]).every((b) => b === 0)).toBe(true);
  });

  test('signature réussie (message EVM) : clé remise à zéro aussi', async () => {
    await execute({ kind: 'personal', from: EVM0, hex: '0x6869', text: 'hi', siwe: null }, { walletId, index: 0 }, {}, { session, wallets });
    expect(secretOf(opened[0]).every((b) => b === 0)).toBe(true);
  });

  test('réseau du site inconnu : échec avant signature, clé remise à zéro', async () => {
    await expect(execute({ kind: 'evmTx', from: EVM0, chainId: '0xdeadbeef', tx: { to: EVM0, data: '0x', value: '0x0' } }, { walletId, index: 0 }, {}, { session, wallets })).rejects.toThrow();
    for (const s of opened) expect(secretOf(s).every((b) => b === 0)).toBe(true);
  });
});
