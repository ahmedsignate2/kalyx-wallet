import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { EvmChainAdapter } from '../../src/domain/chains/EvmChainAdapter';
import { assessAllowance, makeAllowances } from './allowances';
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

describe('évaluer une autorisation', () => {
  const base = { risky: false, unlimited: false, dormant: false, ageDays: 10, spenderName: 'Uniswap V3: Router', openSource: true };
  test('contrat signalé : à révoquer, quoi qu’il arrive', () => {
    expect(assessAllowance({ ...base, risky: true, dormant: true })).toEqual({ level: 'high', reasons: ['risky', 'dormant'] });
  });
  test('illimitée sur un solde réel, contrat anonyme (code non publié) : à révoquer', () => {
    expect(assessAllowance({ ...base, unlimited: true, spenderName: undefined, openSource: false })).toEqual({ level: 'high', reasons: ['unlimited', 'unknown'] });
  });
  test('illimitée vers un contrat connu, récente : à surveiller ; ancienne : à révoquer', () => {
    expect(assessAllowance({ ...base, unlimited: true }).level).toBe('medium');
    expect(assessAllowance({ ...base, unlimited: true, ageDays: 400 })).toEqual({ level: 'high', reasons: ['unlimited', 'old'] });
  });
  test('solde nul : raisonnable aujourd’hui, et dit pourquoi', () => {
    expect(assessAllowance({ ...base, unlimited: true, dormant: true, spenderName: undefined, openSource: undefined })).toEqual({ level: 'low', reasons: ['unlimited', 'unknown', 'dormant'] });
  });
  test('limitée, contrat connu, récente : raisonnable ; liste de confiance : jamais « inconnu »', () => {
    expect(assessAllowance(base)).toEqual({ level: 'low', reasons: [] });
    expect(assessAllowance({ ...base, spenderName: undefined, openSource: undefined, trusted: true }).reasons).not.toContain('unknown');
  });
});

describe('liste intelligente', () => {
  const MAX = 2n ** 256n - 1n;
  const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
  const NOW = 1_800_000_000_000;
  afterEach(() => vi.restoreAllMocks());

  test('valeur exposée = min(autorisation, solde) × prix ; tri par niveau puis exposition ; total', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ code: 1, result: [] }) })));
    vi.spyOn(EvmChainAdapter.prototype, 'getApprovalsReport').mockResolvedValue({
      incomplete: false,
      items: [
        // Limitée à 50 USDC sur un solde de 200 : 50 exposés, contrat connu, récente.
        { token: USDC, symbol: 'USDC', decimals: 6, spender: SPENDER, allowance: 50_000_000n, spenderName: '1inch Router', openSource: true, approvedAt: NOW / 1000 - 5 * 86_400 },
        // Illimitée sur 10 DAI, contrat anonyme : à révoquer, 10 exposés.
        { token: DAI, symbol: 'DAI', decimals: 18, spender: '0x2222222222222222222222222222222222222222', allowance: MAX, openSource: false, approvedAt: NOW / 1000 - 400 * 86_400 },
      ],
    });
    const holdings = [
      { id: `ethereum:${USDC}`, chainId: 'ethereum', kind: 'erc20', contract: USDC, symbol: 'USDC', name: 'USDC', decimals: 6, raw: 200_000_000n, amount: 200, price: 1, fiat: 200, change24h: 0, verified: true },
      { id: `ethereum:${DAI}`, chainId: 'ethereum', kind: 'erc20', contract: DAI, symbol: 'DAI', name: 'DAI', decimals: 18, raw: 10n * 10n ** 18n, amount: 10, price: 1, fiat: 10, change24h: 0, verified: true },
    ];
    const allow = makeAllowances({
      home: { current: async () => ({ wallet: (await wallets.list())[0], index: 0, acct: { evm: EVM0 } }) },
      execute: { session, wallets },
      holdings: async () => holdings as never,
      fiat: async () => 'eur',
      now: () => NOW,
    });
    const r = await allow.list('ethereum');
    expect(r.items.map((x) => [x.symbol, x.level, x.exposed])).toEqual([['DAI', 'high', 10], ['USDC', 'low', 50]]);
    expect(r.items[0].reasons).toEqual(['unlimited', 'unknown', 'old']);
    expect(r.items[0].ageDays).toBe(400);
    expect(r.exposedTotal).toBe(60);
    expect(r.fiat).toBe('eur');
  });

  test('prix inconnu sur un solde réel : total inconnu (jamais sous-estimé)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ code: 1, result: [] }) })));
    vi.spyOn(EvmChainAdapter.prototype, 'getApprovalsReport').mockResolvedValue({ incomplete: false, items: [{ token: DAI, symbol: 'XYZ', decimals: 18, spender: SPENDER, allowance: MAX }] });
    const allow = makeAllowances({
      home: { current: async () => ({ wallet: (await wallets.list())[0], index: 0, acct: { evm: EVM0 } }) },
      execute: { session, wallets },
      holdings: async () => [{ id: 'x', chainId: 'ethereum', kind: 'erc20', contract: DAI, symbol: 'XYZ', name: 'XYZ', decimals: 18, raw: 5n, amount: 0, price: 0, fiat: 0, change24h: null, verified: false }] as never,
    });
    const r = await allow.list('ethereum');
    expect(r.items[0].exposed).toBeNull();
    expect(r.exposedTotal).toBeNull();
  });
});

