import { beforeEach, describe, expect, test } from 'vitest';
import { makeAllowances } from './allowances';
import { makeSession } from './session';
import { makeStore, type StorageArea } from './storage';
import { makeWallets } from './wallets';
import { revokeCalldata } from '../../src/domain/approvals/approvals';

const ABOUT = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const EVM0 = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const SPENDER = '0x1111111254EEB25477B68fb85Ed929f73A960582';

function area(): StorageArea {
  const data: Record<string, unknown> = {};
  return {
    async get(keys) { return Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, structuredClone(data[k])])); },
    async set(items) { Object.assign(data, structuredClone(items)); },
    async remove(keys) { for (const k of keys) delete data[k]; },
  };
}

let session: ReturnType<typeof makeSession>;
let wallets: ReturnType<typeof makeWallets>;
let walletId: string;

beforeEach(async () => {
  const disk = makeStore(area());
  session = makeSession({ disk, session: makeStore(area()), alarms: { create() {}, clear() {} }, kdf: { N: 1 << 10, r: 8, p: 1 } });
  wallets = makeWallets(disk, session);
  await session.create('Plage-Orange-47!');
  walletId = (await wallets.importPhrase(ABOUT)).id;
});

describe('autorisations de tokens', () => {
  test('révoquer = approve(contrat, 0) sur le token, signé par le compte actif, sans valeur', async () => {
    const sent: { chainId: number; to: string; data: string; value: bigint; from: string }[] = [];
    const allow = makeAllowances({
      home: { current: async () => ({ wallet: (await wallets.list())[0], index: 0, acct: { evm: EVM0 } }) },
      execute: { session, wallets, sendEvm: async (_c, req, from) => (sent.push({ chainId: req.chainId, to: req.to!, data: req.data!, value: req.value ?? 0n, from }), `0x${'ab'.repeat(32)}`) },
    });
    expect(await allow.revoke('base', USDC, SPENDER)).toBe(`0x${'ab'.repeat(32)}`);
    expect(sent).toEqual([{ chainId: 8453, to: USDC, data: revokeCalldata(SPENDER), value: 0n, from: EVM0 }]);
    expect(walletId).toBeTruthy();
  });

  test('entrées refusées : réseau hors liste, adresses mal formées, pas de compte EVM', async () => {
    const allow = makeAllowances({ home: { current: async () => ({ wallet: (await wallets.list())[0], index: 0, acct: { evm: EVM0 } }) }, execute: { session, wallets, sendEvm: async () => '0x' } });
    await expect(allow.revoke('solana', USDC, SPENDER)).rejects.toThrow('BAD_REQUEST');
    await expect(allow.revoke('ethereum', 'pas-une-adresse', SPENDER)).rejects.toThrow('BAD_REQUEST');
    await expect(allow.revoke('ethereum', USDC, '0x12')).rejects.toThrow('BAD_REQUEST');
    const noEvm = makeAllowances({ home: { current: async () => null }, execute: { session, wallets } });
    await expect(noEvm.revoke('ethereum', USDC, SPENDER)).rejects.toThrow('NO_ACCOUNT');
  });
});
