/**
 * Choix du meilleur devis d'échange, pour l'EXTENSION (EVM et Solana).
 *
 * Mêmes fournisseurs que l'app, interrogés en parallèle :
 *  - LI.FI (par le relais Kalyx) : toujours — échanges et ponts ;
 *  - Jupiter : échanges sur Solana ;
 *  - Relay.link (par le relais) : ponts au départ d'un réseau EVM.
 * Chaque devis passe le garde du cœur (src/domain/swap/guard) avant d'être
 * retenu ; le meilleur est celui qui GARANTIT le plus (`toAmountMin`). En
 * échec, l'erreur la plus utile à l'utilisateur (un minimum précis plutôt
 * qu'« aucune route »).
 *
 * Le routeur de l'app (src/domain/swap/index) sert aussi TON et Bitcoin ; il
 * n'est pas embarqué ici.
 */
import { getSwapQuote as getLifiQuote, type SwapQuote, type SwapTokenInfo } from '../../src/domain/swap/lifi';
import { getJupiterQuote } from '../../src/domain/swap/jupiter';
import { getRelayQuote, relayEnabled } from '../../src/domain/swap/relay';
import { checkSwapQuote } from '../../src/domain/swap/guard';
import { SwapError, pickMostRelevant } from '../../src/domain/swap/swapError';
import { getAdapter } from '../../src/domain/chains/registry';

const LIFI_SOLANA = 1151111081099710;
const SOL_NATIVE = '11111111111111111111111111111111';
const EVM_ZERO = '0x0000000000000000000000000000000000000000';

export interface RouteParams {
  fromChainId: string;
  toChainId: string;
  fromToken: string;
  toToken: string;
  /** Plus petite unité, en texte. */
  fromAmount: string;
  fromAddress: string;
  toAddress: string;
  slippage?: number;
  fromTokenInfo?: Partial<SwapTokenInfo>;
  toTokenInfo?: Partial<SwapTokenInfo>;
}

/** Jupiter ne rend ni symbole ni décimales : complétés par ce que l'écran connaît. */
function fill(q: SwapQuote, p: RouteParams): SwapQuote {
  const f = (t: SwapTokenInfo, info?: Partial<SwapTokenInfo>): SwapTokenInfo => ({ ...t, symbol: t.symbol || info?.symbol || '', decimals: t.decimals >= 0 ? t.decimals : (info?.decimals ?? 18), logo: t.logo ?? info?.logo });
  return { ...q, fromToken: f(q.fromToken, p.fromTokenInfo), toToken: f(q.toToken, p.toTokenInfo) };
}

export async function bestQuote(p: RouteParams): Promise<SwapQuote | null> {
  const from = getAdapter(p.fromChainId).config;
  const to = getAdapter(p.toChainId).config;
  if ((from.family !== 'evm' && from.family !== 'solana') || (to.family !== 'evm' && to.family !== 'solana')) throw new SwapError('NO_ROUTE', 'réseau non servi');
  const amount = BigInt(p.fromAmount);
  if (amount <= 0n) throw new SwapError('NO_ROUTE', 'montant');
  const same = from.id === to.id;
  const lifiChain = (c: typeof from) => (c.family === 'solana' ? LIFI_SOLANA : c.evmChainId!);
  const lifiToken = (a: string, family: string) => (a === EVM_ZERO && family === 'solana' ? SOL_NATIVE : a);

  const errors: SwapError[] = [];
  const tasks: Promise<SwapQuote | null>[] = [];
  const run = (fn: () => Promise<SwapQuote | null>) =>
    tasks.push(fn().catch((e: unknown) => (errors.push(e instanceof SwapError ? e : new SwapError('NETWORK', 'network')), null)));

  run(() => getLifiQuote({ fromChainId: lifiChain(from), toChainId: lifiChain(to), fromToken: lifiToken(p.fromToken, from.family), toToken: lifiToken(p.toToken, to.family), fromAmount: amount, fromAddress: p.fromAddress, toAddress: p.toAddress, slippage: p.slippage }));
  if (same && from.family === 'solana') {
    run(() => getJupiterQuote({ fromChainId: p.fromChainId, toChainId: p.toChainId, fromToken: p.fromToken, toToken: p.toToken, fromAmount: amount, fromAddress: p.fromAddress, slippage: p.slippage }));
  }
  if (!same && from.family === 'evm' && relayEnabled()) {
    run(() =>
      getRelayQuote({
        fromChainId: from.relayId ?? String(from.evmChainId),
        toChainId: to.relayId ?? (to.evmChainId ? String(to.evmChainId) : to.id),
        fromToken: p.fromToken,
        toToken: lifiToken(p.toToken, to.family),
        fromAmount: p.fromAmount,
        fromAddress: p.fromAddress,
        toAddress: p.toAddress,
        slippage: p.slippage,
      }),
    );
  }

  const quotes = (await Promise.all(tasks))
    .filter((q): q is SwapQuote => q !== null)
    .map((q) => fill(q, p))
    .filter((q) => {
      const c = checkSwapQuote(q, { fromEvmChainId: from.family === 'evm' ? from.evmChainId : undefined, fromToken: p.fromToken, fromAmount: amount, fromAddress: p.fromAddress, toAddress: p.toAddress, toToken: p.toToken });
      if (!c.ok) errors.push(new SwapError('PROVIDER_UNAVAILABLE', c.reason));
      return c.ok;
    });
  if (quotes.length) return quotes.sort((a, b) => (b.toAmountMin > a.toAmountMin ? 1 : b.toAmountMin < a.toAmountMin ? -1 : 0))[0];
  throw pickMostRelevant(errors) ?? new SwapError('NO_ROUTE', 'aucune route');
}
