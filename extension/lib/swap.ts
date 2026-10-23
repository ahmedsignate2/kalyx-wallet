/**
 * ÉCHANGE (swap et pont) dans l'extension, avec le moteur de l'app
 * (src/domain/swap : LI.FI par le relais, Jupiter sur Solana, Relay.link).
 *
 * Règles, les mêmes que l'app :
 *  - on ne part que d'un actif VÉRIFIÉ et détenu ; on n'arrive que vers un
 *    jeton de la liste du réseau (LI.FI) : aucun faux jeton choisi au hasard ;
 *  - l'arrivée est TOUJOURS l'un de nos comptes (le garde du cœur relit la
 *    transaction : contrat LI.FI officiel, autorisation, jeton, montant,
 *    destinataire). Un devis qui ne passe pas n'est jamais signé ;
 *  - réserve de gas : on ne propose pas de dépenser ce qui paierait les frais ;
 *  - le devis est gardé ICI (l'écran n'en voit qu'un résumé et un
 *    identifiant) : ce qui est signé est ce qui a été contrôlé. Trop vieux, il
 *    est redemandé et refusé s'il garantit moins que ce qui a été montré ;
 *  - autorisation ERC-20 au montant exact (jamais illimitée), remise à zéro
 *    d'abord si une autorisation insuffisante existe (USDT).
 *
 * La signature passe par `execute` (lib/dappSign) : coffre, ou téléphone en
 * mode compagnon. Chaque transaction est suivie jusqu'à son issue (txWatch).
 */
import { base58, base64 } from '@scure/base';
import { bytesToHex } from '@noble/hashes/utils';
import { checkSwapQuote } from '../../src/domain/swap/guard';
import { SwapError } from '../../src/domain/swap/swapError';
import type { SwapQuote } from '../../src/domain/swap/lifi';
import { bestQuote, type RouteParams } from './swapRouter';
import { getAdapter } from '../../src/domain/chains/registry';
import type { EvmChainAdapter } from '../../src/domain/chains/EvmChainAdapter';
import type { ChainConfig } from '../../src/domain/chains/types';
import { estimateGasReserve } from '../../src/domain/chains/gasReserve';
import { relayOrDirect } from '../../src/domain/net/relay';
import { parseAmount } from '../../src/domain/validation/amount';
import { formatInputAmount, formatTokenAmount } from '../../src/domain/validation/format';
import { getRandomBytes } from '../../src/crypto/random';
import { execute, type ExecuteDeps } from './dappSign';
import { viewChains } from './assets';
import { chainLogo, type Acct, type Portfolio } from './portfolio';
import { WalletError } from './wallets';
import type { Home } from './home';
import { RpcError } from './rpcError';
import { WalletError as CoreError } from '../../src/domain/errors';

export const EVM_NATIVE = '0x0000000000000000000000000000000000000000';
export const SOL_NATIVE = '11111111111111111111111111111111';
/** Âge au-delà duquel le devis est redemandé avant de signer (calldata, blockhash Solana). */
export const QUOTE_FRESH_MS = 25_000;
/** Au-delà, l'écran doit redemander un devis. */
export const QUOTE_MAX_MS = 120_000;
/** Écart de prix à partir duquel une confirmation explicite est demandée. */
export const IMPACT_ACK = 0.03;
const SLIPPAGES = [0.001, 0.005, 0.01, 0.03];

/** Erreur d'échange, avec ses valeurs d'affichage (minimum, symbole…). */
export class SwapFail extends WalletError {
  constructor(code: string, readonly params?: Record<string, string>) {
    super(code);
  }
}

export interface SwapToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logo?: string;
}

export interface SwapSource extends SwapToken {
  key: string;
  chainId: string;
  chainName: string;
  chainLogo?: string;
  family: 'evm' | 'solana';
  balanceFmt: string;
  /** Solde entier à mettre dans le champ (Max), sans arrondi d'affichage. */
  maxInput: string;
}

export interface QuoteView {
  id: string;
  fromAmount: string;
  fromSymbol: string;
  toAmount: string;
  toAmountMin: string;
  toSymbol: string;
  fromChain: string;
  toChain: string;
  bridge: boolean;
  tool: string;
  /** Frais réseau estimés (natif), frais de service (USD), durée. */
  gas?: string;
  feeUsd?: number;
  gasUsd?: number;
  durationSec: number;
  slippagePct: number;
  /** Écart de prix entrée/sortie (fraction), si les deux valeurs sont connues. */
  impact: number | null;
  needsAck: boolean;
  /** Une autorisation ERC-20 (au montant exact) précède l'échange. */
  approval: boolean;
  kalyxFeePct: number;
}

interface Held {
  quote: SwapQuote;
  at: number;
  params: RouteParams;
  fromChain: ChainConfig;
  toChain: ChainConfig;
  shownMin: bigint;
  needsAck: boolean;
  /** Valeur de ce qui part, dans la devise affichée (plafond journalier) ; null sans prix. */
  fiat: number | null;
}

export interface SwapDeps {
  home: Pick<Home, 'current' | 'fiat'>;
  portfolio: Pick<Portfolio, 'holdings' | 'markStale'>;
  execute: Omit<ExecuteDeps, 'tokenMeta'>;
  onSent?: (w: { txid: string; chainId: string; chainName: string; what: string; explorer?: string }) => void;
  now?: () => number;
  /** Injectables pour les tests (sinon : le réseau). */
  quote?: typeof bestQuote;
  tokenList?: (chain: ChainConfig) => Promise<SwapToken[]>;
  gasReserve?: (chain: ChainConfig) => Promise<bigint>;
  evm?: {
    allowance: (chain: ChainConfig, token: string, owner: string, spender: string) => Promise<bigint>;
    nativeBalance: (chain: ChainConfig, owner: string) => Promise<bigint>;
    wait: (chain: ChainConfig, hash: string) => Promise<void>;
    waitAllowance: (chain: ChainConfig, token: string, owner: string, spender: string, amount: bigint) => Promise<boolean>;
  };
  run?: typeof execute;
}

const clean = (s: unknown, max: number) => (typeof s === 'string' ? s.replace(/[^\p{L}\p{N} .$_+-]/gu, '').trim().slice(0, max) : '');
const safeLogo = (u: unknown) => (typeof u === 'string' && /^https:\/\/[^\s"'<>]+$/i.test(u) ? u : undefined);
const isNative = (a: string) => [EVM_NATIVE, SOL_NATIVE, '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'].includes(a.toLowerCase()) || a === SOL_NATIVE;

/** Liste LI.FI d'un réseau (par le relais, copie d'hier en secours), nettoyée, 50 premiers jetons. */
async function lifiTokens(chain: ChainConfig): Promise<SwapToken[]> {
  const q = chain.family === 'solana' ? 'chains=SOL&chainTypes=SVM' : `chains=${chain.evmChainId}`;
  const res = await relayOrDirect('lifi', `/lifi/v1/tokens?${q}`, () => fetch(`https://li.quest/v1/tokens?${q}`));
  if (!res?.ok) throw new SwapFail('SWAP_TOKENS_UNAVAILABLE');
  const json = (await res.json()) as { tokens?: Record<string, unknown[]> };
  const list = Object.values(json?.tokens ?? {})[0] ?? [];
  const out: SwapToken[] = [];
  for (const raw of list.slice(0, 80)) {
    const t = raw as { address?: unknown; symbol?: unknown; name?: unknown; decimals?: unknown; logoURI?: unknown };
    const address = typeof t.address === 'string' ? t.address : '';
    const okAddr = chain.family === 'evm' ? /^0x[0-9a-fA-F]{40}$/.test(address) : /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
    const symbol = clean(t.symbol, 12);
    const decimals = Number(t.decimals);
    if (!okAddr || !symbol || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) continue;
    out.push({ address, symbol, name: clean(t.name, 40) || symbol, decimals, logo: safeLogo(t.logoURI) });
    if (out.length >= 50) break;
  }
  return out;
}

export function makeSwap(deps: SwapDeps) {
  const now = deps.now ?? Date.now;
  const getQuote = deps.quote ?? bestQuote;
  const tokenList = deps.tokenList ?? lifiTokens;
  const reserveOf = deps.gasReserve ?? (async (c: ChainConfig) => (await estimateGasReserve(getAdapter(c.id))).raw);
  const run = deps.run ?? execute;
  const evm = deps.evm ?? {
    allowance: (c: ChainConfig, token: string, owner: string, spender: string) => (getAdapter(c.id) as EvmChainAdapter).getAllowance(token, owner, spender),
    nativeBalance: async (c: ChainConfig, owner: string) => (await getAdapter(c.id).getBalance(owner)).raw,
    wait: async (c: ChainConfig, hash: string) => void (await (getAdapter(c.id) as EvmChainAdapter).waitForTx(hash)),
    waitAllowance: (c: ChainConfig, token: string, owner: string, spender: string, amount: bigint) => (getAdapter(c.id) as EvmChainAdapter).waitForAllowance(token, owner, spender, amount),
  };
  const held = new Map<string, Held>();
  const lists = new Map<string, { at: number; list: SwapToken[] }>();
  /** Étape en cours d'un échange (lue par l'écran pendant qu'il attend). */
  const stages = new Map<string, string>();

  const chainOf = (id: unknown): ChainConfig => {
    const c = viewChains().find((x) => x.id === id);
    if (!c) throw new SwapFail('BAD_REQUEST');
    return c;
  };

  async function account() {
    const cur = await deps.home.current();
    if (!cur) throw new SwapFail('UNKNOWN_ACCOUNT');
    return cur;
  }
  const addressFor = (a: Acct, c: ChainConfig) => (c.family === 'evm' ? a.evm : a.solana);

  /** Ce dont on peut partir : les actifs vérifiés détenus, sur les réseaux servis. */
  async function sources(): Promise<SwapSource[]> {
    const cur = await account();
    const list = await deps.portfolio.holdings(cur.acct, await deps.home.fiat());
    const chains = new Map(viewChains().map((c) => [c.id, c]));
    return list
      .filter((h) => h.verified && h.raw > 0n && chains.has(h.chainId))
      .map((h) => {
        const c = chains.get(h.chainId)!;
        const address = h.kind === 'native' ? (c.family === 'solana' ? SOL_NATIVE : EVM_NATIVE) : h.contract ?? '';
        return { key: h.id, chainId: c.id, chainName: c.name, chainLogo: chainLogo(c.id), family: c.family as 'evm' | 'solana', address, symbol: h.symbol, name: h.name, decimals: h.decimals, logo: safeLogo(h.logo), balanceFmt: formatTokenAmount(h.raw, h.decimals), maxInput: formatInputAmount(h.raw, h.decimals) };
      })
      .filter((s) => !!s.address);
  }

  /** Jetons d'arrivée d'un réseau : natif d'abord, puis la liste LI.FI (gardée 1 h). */
  async function targets(chainId: unknown): Promise<SwapToken[]> {
    const c = chainOf(chainId);
    const hit = lists.get(c.id);
    if (hit && now() - hit.at < 3_600_000) return hit.list;
    const native: SwapToken = { address: c.family === 'solana' ? SOL_NATIVE : EVM_NATIVE, symbol: c.nativeSymbol, name: c.name, decimals: c.nativeDecimals, logo: chainLogo(c.id) };
    const rest = (await tokenList(c)).filter((t) => !isNative(t.address) && t.symbol !== c.nativeSymbol);
    const list = [native, ...rest];
    lists.set(c.id, { at: now(), list });
    return list;
  }

  function viewOf(id: string, h: Held): QuoteView {
    const q = h.quote;
    const impact = q.fromAmountUsd > 0 && q.toAmountUsd > 0 ? Math.max(0, (q.fromAmountUsd - q.toAmountUsd) / q.fromAmountUsd) : null;
    return {
      id,
      fromAmount: formatTokenAmount(q.fromAmount, q.fromToken.decimals),
      fromSymbol: q.fromToken.symbol,
      toAmount: formatTokenAmount(q.toAmount, q.toToken.decimals),
      toAmountMin: formatTokenAmount(q.toAmountMin, q.toToken.decimals),
      toSymbol: q.toToken.symbol,
      fromChain: h.fromChain.name,
      toChain: h.toChain.name,
      bridge: h.fromChain.id !== h.toChain.id,
      tool: clean(q.toolName, 30) || 'LI.FI',
      gas: q.gasCostNative > 0n ? `${formatTokenAmount(q.gasCostNative, h.fromChain.nativeDecimals)} ${h.fromChain.nativeSymbol}` : undefined,
      feeUsd: q.feeCostUsd > 0 ? q.feeCostUsd : undefined,
      gasUsd: q.gasCostUsd > 0 ? q.gasCostUsd : undefined,
      durationSec: q.durationSec,
      slippagePct: q.slippage * 100,
      impact,
      needsAck: h.needsAck,
      approval: q.tx.type === 'evm' && !!q.approvalAddress && !isNative(q.fromToken.address),
      kalyxFeePct: (q.kalyxFeeApplied ?? 0) * 100,
    };
  }

  /** Le garde du cœur, avec NOTRE adresse d'arrivée. */
  function guard(q: SwapQuote, h: Pick<Held, 'params' | 'fromChain'>) {
    const c = checkSwapQuote(q, {
      fromEvmChainId: h.fromChain.family === 'evm' ? h.fromChain.evmChainId : undefined,
      fromToken: h.params.fromToken,
      fromAmount: BigInt(h.params.fromAmount),
      fromAddress: h.params.fromAddress,
      toAddress: h.params.toAddress,
      toToken: h.params.toToken,
    });
    if (!c.ok) throw new SwapFail('SWAP_REFUSED', { reason: c.reason });
  }

  async function quote(input: { from?: unknown; toChainId?: unknown; toToken?: unknown; amount?: unknown; slippage?: unknown }): Promise<QuoteView> {
    const cur = await account();
    const src = (await sources()).find((s) => s.key === input.from);
    if (!src) throw new SwapFail('SWAP_NO_SOURCE');
    const fromChain = chainOf(src.chainId);
    const toChain = chainOf(input.toChainId);
    const target = (await targets(toChain.id)).find((t) => t.address === input.toToken);
    if (!target) throw new SwapFail('SWAP_BAD_TARGET');
    if (fromChain.id === toChain.id && target.address.toLowerCase() === src.address.toLowerCase()) throw new SwapFail('SWAP_SAME_TOKEN');
    const toAddress = addressFor(cur.acct, toChain);
    if (!toAddress) throw new SwapFail('SWAP_NO_ADDRESS', { chain: toChain.name });
    const fromAddress = addressFor(cur.acct, fromChain)!;
    const slippage = SLIPPAGES.includes(Number(input.slippage)) ? Number(input.slippage) : 0.005;
    if (typeof input.amount !== 'string') throw new SwapFail('INVALID_AMOUNT');
    const raw = parseAmount(input.amount, src.decimals).raw;
    if (raw <= 0n) throw new SwapFail('INVALID_AMOUNT');

    // Solde et réserve de gas, AVANT tout devis.
    const holdings = await deps.portfolio.holdings(cur.acct, await deps.home.fiat());
    const bal = holdings.find((h) => h.id === src.key)?.raw ?? 0n;
    if (raw > bal) throw new SwapFail('INSUFFICIENT_FUNDS');
    const reserve = await reserveOf(fromChain).catch(() => null);
    const reserveFmt = reserve != null ? `${formatTokenAmount(reserve, fromChain.nativeDecimals)} ${fromChain.nativeSymbol}` : '';
    if (isNative(src.address)) {
      if (reserve != null && raw > bal - reserve) throw new SwapFail('SWAP_KEEP_GAS', { amount: reserveFmt });
    } else {
      const native = holdings.find((h) => h.chainId === fromChain.id && h.kind === 'native')?.raw ?? 0n;
      if (reserve != null && native < reserve) throw new SwapFail('SWAP_NEED_GAS', { amount: reserveFmt });
    }

    const params = {
      fromChainId: fromChain.id,
      toChainId: toChain.id,
      fromToken: src.address,
      toToken: target.address,
      fromAmount: raw.toString(),
      fromAddress,
      toAddress,
      slippage,
      fromTokenInfo: { symbol: src.symbol, decimals: src.decimals, logo: src.logo },
      toTokenInfo: { symbol: target.symbol, decimals: target.decimals, logo: target.logo },
    };
    const q = await getQuote(params);
    if (!q) throw new SwapFail('SWAP_NO_ROUTE');
    const price = holdings.find((x) => x.id === src.key)?.price ?? 0;
    const h: Held = { quote: q, at: now(), params, fromChain, toChain, shownMin: q.toAmountMin, needsAck: false, fiat: price > 0 ? (Number(raw) / 10 ** src.decimals) * price : null };
    guard(q, h);
    const v0 = viewOf('', h);
    h.needsAck = v0.impact != null && v0.impact >= IMPACT_ACK;
    const id = bytesToHex(getRandomBytes(12));
    // Un seul devis vivant par compte : les anciens ne peuvent plus être signés.
    held.clear();
    held.set(id, h);
    return viewOf(id, h);
  }

  /** Signe et envoie. `ack` : écart de prix élevé vu et accepté. */
  async function confirm(id: unknown, ack: unknown): Promise<{ txid: string; explorer?: string }> {
    const h = typeof id === 'string' ? held.get(id) : undefined;
    if (!h) throw new SwapFail('SWAP_QUOTE_GONE');
    if (now() - h.at > QUOTE_MAX_MS) {
      held.delete(id as string);
      throw new SwapFail('SWAP_QUOTE_GONE');
    }
    if (h.needsAck && ack !== true) throw new SwapFail('SWAP_ACK_NEEDED');
    held.delete(id as string); // jamais signé deux fois
    const cur = await account();
    // Le compte affiché a pu changer depuis le devis.
    if (addressFor(cur.acct, h.fromChain) !== h.params.fromAddress) throw new SwapFail('SWAP_QUOTE_GONE');
    let q = h.quote;
    if (now() - h.at > QUOTE_FRESH_MS) {
      // Devis rafraîchi (calldata, blockhash) : refusé s'il garantit moins que ce qui a été montré.
      const fresh = await getQuote(h.params);
      if (!fresh) throw new SwapFail('SWAP_NO_ROUTE');
      if (fresh.toAmountMin < h.shownMin) throw new SwapFail('SWAP_QUOTE_WORSE', { min: `${formatTokenAmount(fresh.toAmountMin, fresh.toToken.decimals)} ${fresh.toToken.symbol}` });
      q = fresh;
    }
    guard(q, h);
    const grant = { walletId: cur.wallet.id, index: cur.index };
    const stage = (s: string) => stages.set(id as string, s);
    try {
      let txid: string;
      if (q.tx.type === 'evm') {
        const chain = h.fromChain;
        const hex = (n: bigint) => `0x${n.toString(16)}`;
        const chainHex = hex(BigInt(chain.evmChainId!));
        if (q.approvalAddress && !isNative(q.fromToken.address)) {
          const allowance = await evm.allowance(chain, q.fromToken.address, h.params.fromAddress, q.approvalAddress);
          if (allowance < q.fromAmount) {
            stage('approving');
            const approve = (amount: bigint) => {
              const data = `0x095ea7b3${q.approvalAddress!.slice(2).toLowerCase().padStart(64, '0')}${amount.toString(16).padStart(64, '0')}`;
              return run({ kind: 'evmTx', from: h.params.fromAddress, chainId: chainHex, tx: { to: q.fromToken.address, data, value: '0x0' } }, grant, {}, deps.execute) as Promise<string>;
            };
            // USDT et quelques anciens jetons : remise à zéro avant une nouvelle autorisation.
            if (allowance > 0n) await evm.wait(chain, await approve(0n));
            const ah = await approve(q.fromAmount);
            stage('approvalWait');
            await evm.wait(chain, ah);
            if (!(await evm.waitAllowance(chain, q.fromToken.address, h.params.fromAddress, q.approvalAddress, q.fromAmount))) throw new SwapFail('SWAP_APPROVAL_NOT_SEEN');
          }
        }
        stage('swapping');
        const tx = q.tx;
        txid = (await run(
          { kind: 'evmTx', from: h.params.fromAddress, chainId: chainHex, tx: { to: tx.to, data: tx.data, value: hex(tx.value), ...(tx.gasLimit ? { gas: hex(tx.gasLimit) } : {}) } },
          grant,
          {},
          deps.execute,
        )) as string;
      } else if (q.tx.type === 'solana') {
        stage('swapping');
        // Diffusion avec simulation préalable (preflight) : un échec prévu n'est pas envoyé.
        const out = (await run({ kind: 'solTx', from: h.params.fromAddress, txs: [q.tx.data], send: true }, grant, {}, deps.execute)) as { signature: string }[];
        txid = base58.encode(base64.decode(out[0].signature));
      } else throw new SwapFail('SWAP_REFUSED', { reason: 'NOT_OUR_TX' });
      const explorer = h.fromChain.explorerUrl ? `${h.fromChain.explorerUrl}/tx/${txid}` : undefined;
      deps.portfolio.markStale(cur.acct);
      const what = `${formatTokenAmount(q.fromAmount, q.fromToken.decimals)} ${q.fromToken.symbol} → ${q.toToken.symbol}`;
      deps.onSent?.({ txid, chainId: h.fromChain.id, chainName: h.fromChain.name, what, explorer });
      return { txid, explorer };
    } catch (e) {
      // Échec du réseau ou de la diffusion : sa raison (courte), jamais une pile. Les codes connus passent tels quels.
      if (e instanceof WalletError || e instanceof CoreError || (e instanceof RpcError && /^COMPANION_/.test(e.message))) throw e;
      const reason = (e instanceof Error ? e.message : String(e)).replace(/\s+/g, ' ').slice(0, 120);
      throw new SwapFail('SWAP_TX_FAILED', { reason });
    } finally {
      stages.delete(id as string);
    }
  }

  return { sources, targets, quote, confirm, stage: (id: unknown) => (typeof id === 'string' ? stages.get(id) ?? null : null), slippages: SLIPPAGES, valueOf: (id: unknown) => (typeof id === 'string' ? held.get(id)?.fiat : undefined) };
}

export type Swap = ReturnType<typeof makeSwap>;
export { SwapError };
