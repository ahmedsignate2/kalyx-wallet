import { beforeEach, describe, expect, test } from 'vitest';
import { makeSwap, EVM_NATIVE, QUOTE_FRESH_MS, SOL_NATIVE } from './swap';
import { lifiContractFor } from '../../src/domain/swap/guard';
import type { SwapQuote } from '../../src/domain/swap/lifi';
import type { Holding } from '../../lib/portfolio/holdings';
import type { RouteParams } from './swapRouter';

// Adresses publiques réelles : compte de test Hardhat, USDC et USDT sur Ethereum.
const EVM = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const SOL = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const LIFI = lifiContractFor(1)!;

const h = (id: string, symbol: string, raw: bigint, extra: Partial<Holding> = {}): Holding => ({
  id, chainId: id.split(':')[0], kind: id.endsWith(':native') ? 'native' : 'erc20', symbol, name: symbol, decimals: 18, raw, amount: 0, price: 1, fiat: 1, change24h: null, verified: true, ...extra,
});

let clock = 1_000_000;
let holdings: Holding[];
let calls: { kind: string; to?: string; data?: string }[];
let allowance = 0n;
let quoteFn: (p: RouteParams) => Promise<SwapQuote | null>;

/** Devis LI.FI conforme au garde : contrat officiel, destinataire dans les données. */
function evmQuote(p: RouteParams, out = 990n, min = 980n, extra: Partial<SwapQuote> = {}): SwapQuote {
  return {
    fromAmount: BigInt(p.fromAmount), toAmount: out, toAmountMin: min,
    fromToken: { address: p.fromToken, symbol: p.fromTokenInfo?.symbol ?? '', decimals: p.fromTokenInfo?.decimals ?? 18 },
    toToken: { address: p.toToken, symbol: p.toTokenInfo?.symbol ?? '', decimals: p.toTokenInfo?.decimals ?? 18 },
    approvalAddress: p.fromToken === EVM_NATIVE ? null : LIFI, toolName: 'LI.FI', gasCostUsd: 1, gasCostNative: 10n ** 15n, gasToken: null, feeCostUsd: 0, durationSec: 30,
    fromAmountUsd: 100, toAmountUsd: 99, slippage: 0.005,
    tx: { type: 'evm', to: LIFI, data: `0xdeadbeef${p.toAddress.slice(2).toLowerCase().padStart(64, '0')}`, value: 0n, chainId: 1 },
    ...extra,
  };
}

const make = () =>
  makeSwap({
    home: { current: async () => ({ wallet: { id: 'w1' } as never, index: 0, acct: { evm: EVM, solana: SOL } }), fiat: async () => 'usd' as never },
    portfolio: { holdings: async () => holdings, markStale: () => {} },
    execute: {} as never,
    now: () => clock,
    quote: (p) => quoteFn(p),
    tokenList: async (c) => (c.family === 'evm' ? [{ address: USDC, symbol: 'USDC', name: 'USD Coin', decimals: 6 }, { address: USDT, symbol: 'USDT', name: 'Tether', decimals: 6 }] : []),
    gasReserve: async () => 10n ** 16n, // 0,01 ETH
    evm: {
      allowance: async () => allowance,
      nativeBalance: async () => 10n ** 18n,
      wait: async () => {},
      waitAllowance: async () => true,
    },
    run: (async (req: { kind: string; tx?: { to: string; data: string } }) => {
      calls.push({ kind: req.kind, to: req.tx?.to, data: req.tx?.data });
      return req.kind === 'solTx' ? [{ signature: 'AQID' }] : `0x${String(calls.length).padStart(64, '0')}`;
    }) as never,
  });

const code = (p: Promise<unknown>) => p.then(() => 'ok', (e: Error) => e.message);

beforeEach(() => {
  clock = 1_000_000;
  calls = [];
  allowance = 0n;
  holdings = [h('ethereum:native', 'ETH', 10n ** 18n), h(`ethereum:${USDC}`, 'USDC', 5_000_000n, { contract: USDC, decimals: 6 }), h('base:spam', 'FAKE', 1n, { verified: false })];
  quoteFn = async (p) => evmQuote(p);
});

describe('échange : choix et devis', () => {
  test('on ne part que d’un actif vérifié et détenu', async () => {
    const s = await make().sources();
    expect(s.map((x) => x.symbol)).toEqual(['ETH', 'USDC']);
    expect(s[0].address).toBe(EVM_NATIVE);
    // Max : le solde exact (formatInputAmount), pas l'affichage arrondi.
    expect(s[1].maxInput).toBe('5');
  });

  test('arrivée : natif d’abord, puis la liste ; un jeton hors liste est refusé', async () => {
    const sw = make();
    expect((await sw.targets('ethereum')).map((t) => t.symbol)).toEqual(['ETH', 'USDC', 'USDT']);
    expect(await code(sw.quote({ from: 'ethereum:native', toChainId: 'ethereum', toToken: '0x1111111111111111111111111111111111111111', amount: '0.1' }))).toBe('SWAP_BAD_TARGET');
  });

  test('vérifications avant tout devis : même jeton, solde, réserve de gas', async () => {
    const sw = make();
    expect(await code(sw.quote({ from: `ethereum:${USDC}`, toChainId: 'ethereum', toToken: USDC, amount: '1' }))).toBe('SWAP_SAME_TOKEN');
    expect(await code(sw.quote({ from: `ethereum:${USDC}`, toChainId: 'ethereum', toToken: USDT, amount: '6' }))).toBe('INSUFFICIENT_FUNDS');
    expect(await code(sw.quote({ from: 'ethereum:native', toChainId: 'ethereum', toToken: USDC, amount: '0.995' }))).toBe('SWAP_KEEP_GAS');
    holdings = holdings.filter((x) => x.kind !== 'native');
    expect(await code(sw.quote({ from: `ethereum:${USDC}`, toChainId: 'ethereum', toToken: USDT, amount: '1' }))).toBe('SWAP_NEED_GAS');
  });

  test('devis : arrivée sur NOTRE adresse, contrôlé par le garde', async () => {
    let seen: RouteParams | null = null;
    quoteFn = async (p) => ((seen = p), evmQuote(p));
    const v = await make().quote({ from: `ethereum:${USDC}`, toChainId: 'ethereum', toToken: USDT, amount: '1', slippage: 0.01 });
    expect(seen).toMatchObject({ fromAddress: EVM, toAddress: EVM, fromToken: USDC, toToken: USDT, fromAmount: '1000000', slippage: 0.01 });
    expect(v).toMatchObject({ approval: true, bridge: false, needsAck: false, tool: 'LI.FI' });
  });

  test('un devis qui paie quelqu’un d’autre est refusé (garde)', async () => {
    quoteFn = async (p) => evmQuote({ ...p, toAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' });
    expect(await code(make().quote({ from: 'ethereum:native', toChainId: 'ethereum', toToken: USDC, amount: '0.1' }))).toBe('SWAP_REFUSED');
    quoteFn = async (p) => ({ ...evmQuote(p), tx: { ...(evmQuote(p).tx as object), to: '0x1111111111111111111111111111111111111111' } as SwapQuote['tx'] });
    expect(await code(make().quote({ from: 'ethereum:native', toChainId: 'ethereum', toToken: USDC, amount: '0.1' }))).toBe('SWAP_REFUSED');
  });

  test('pont vers Solana : arrivée sur l’adresse Solana du compte', async () => {
    let seen: RouteParams | null = null;
    quoteFn = async (p) => ((seen = p), null);
    expect(await code(make().quote({ from: 'ethereum:native', toChainId: 'solana', toToken: SOL_NATIVE, amount: '0.1' }))).toBe('SWAP_NO_ROUTE');
    expect(seen).toMatchObject({ toChainId: 'solana', toAddress: SOL, toToken: SOL_NATIVE });
  });
});

describe('échange : signature', () => {
  test('autorisation au montant exact, remise à zéro d’abord si une autorisation existe, puis l’échange', async () => {
    allowance = 1n;
    const sw = make();
    const v = await sw.quote({ from: `ethereum:${USDC}`, toChainId: 'ethereum', toToken: USDT, amount: '2' });
    await sw.confirm(v.id, false);
    expect(calls.map((c) => c.to)).toEqual([USDC, USDC, LIFI]);
    expect(calls[0].data).toBe(`0x095ea7b3${LIFI.slice(2).toLowerCase().padStart(64, '0')}${'0'.repeat(64)}`);
    expect(calls[1].data?.endsWith((2_000_000n).toString(16).padStart(64, '0'))).toBe(true);
    // Jamais signé deux fois.
    expect(await code(sw.confirm(v.id, false))).toBe('SWAP_QUOTE_GONE');
  });

  test('autorisation suffisante : seulement l’échange', async () => {
    allowance = 10n ** 30n;
    const sw = make();
    const v = await sw.quote({ from: `ethereum:${USDC}`, toChainId: 'ethereum', toToken: USDT, amount: '2' });
    await sw.confirm(v.id, false);
    expect(calls.map((c) => c.to)).toEqual([LIFI]);
  });

  test('écart de prix élevé : confirmation explicite exigée', async () => {
    quoteFn = async (p) => evmQuote(p, 900n, 890n, { fromAmountUsd: 100, toAmountUsd: 90 });
    const sw = make();
    const v = await sw.quote({ from: 'ethereum:native', toChainId: 'ethereum', toToken: USDC, amount: '0.1' });
    expect(v.needsAck).toBe(true);
    expect(await code(sw.confirm(v.id, false))).toBe('SWAP_ACK_NEEDED');
    expect(calls).toEqual([]);
  });

  test('devis ancien : redemandé, et refusé s’il garantit moins que ce qui a été montré', async () => {
    const sw = make();
    const v = await sw.quote({ from: 'ethereum:native', toChainId: 'ethereum', toToken: USDC, amount: '0.1' });
    clock += QUOTE_FRESH_MS + 1;
    quoteFn = async (p) => evmQuote(p, 950n, 940n);
    expect(await code(sw.confirm(v.id, false))).toBe('SWAP_QUOTE_WORSE');
    expect(calls).toEqual([]);
    quoteFn = async (p) => evmQuote(p);
    const w = await sw.quote({ from: 'ethereum:native', toChainId: 'ethereum', toToken: USDC, amount: '0.1' });
    clock += 200_000;
    expect(await code(sw.confirm(w.id, false))).toBe('SWAP_QUOTE_GONE');
  });

  test('un nouveau devis rend l’ancien impossible à signer', async () => {
    const sw = make();
    const a = await sw.quote({ from: 'ethereum:native', toChainId: 'ethereum', toToken: USDC, amount: '0.1' });
    await sw.quote({ from: 'ethereum:native', toChainId: 'ethereum', toToken: USDT, amount: '0.1' });
    expect(await code(sw.confirm(a.id, false))).toBe('SWAP_QUOTE_GONE');
  });

  test('échec de diffusion : une raison courte, jamais une pile', async () => {
    const sw = makeSwap({
      home: { current: async () => ({ wallet: { id: 'w1' } as never, index: 0, acct: { evm: EVM, solana: SOL } }), fiat: async () => 'usd' as never },
      portfolio: { holdings: async () => holdings, markStale: () => {} },
      execute: {} as never,
      now: () => clock,
      quote: (p) => quoteFn(p),
      tokenList: async () => [{ address: USDC, symbol: 'USDC', name: 'USD Coin', decimals: 6 }],
      gasReserve: async () => 10n ** 16n,
      run: (async () => {
        throw new Error(`execution reverted\n    at sendContractTx (${'x'.repeat(300)})`);
      }) as never,
    });
    const v = await sw.quote({ from: 'ethereum:native', toChainId: 'ethereum', toToken: USDC, amount: '0.1' });
    const e = await sw.confirm(v.id, false).catch((x: Error & { params?: Record<string, string> }) => x);
    expect((e as Error).message).toBe('SWAP_TX_FAILED');
    expect((e as unknown as { params: { reason: string } }).params.reason.length).toBeLessThanOrEqual(120);
    expect((e as unknown as { params: { reason: string } }).params.reason.startsWith('execution reverted')).toBe(true);
  });
});
