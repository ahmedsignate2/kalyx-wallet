/**
 * Kalyx Smart Router — un seul point d'entrée pour swap ET bridge.
 *
 * Providers (chacun lancé UNE fois, en parallèle, avec son propre timeout) :
 *  - LI.FI   : toujours. Couvre EVM, Solana (Jupiter) et cross-VM (Mayan, Across, Relay…).
 *  - Jupiter : intra-Solana uniquement (2ᵉ source, endpoint lite-api).
 *  - Relay   : cross-chain depuis une chaîne EVM, SEULEMENT si une clé API est configurée.
 *
 * Sélection : meilleur `toAmountMin` (montant garanti). Échec : on lève le
 * SwapError le plus ACTIONNABLE (minimum précis > token invalide > … > aucune
 * route) — jamais un « aucune route » quand la vraie cause est le réseau.
 */
import { getSwapQuote as getLifiQuote } from './lifi';
import { getJupiterQuote } from './jupiter';
import { getRelayQuote, relayEnabled } from './relay';
import { getAdapter } from '../chains/registry';
import { SwapError, pickMostRelevant } from './swapError';
import type { SwapQuote, SwapTokenInfo } from './lifi';

const LIFI_SOLANA = 1151111081099710;
const SOL_NATIVE = '11111111111111111111111111111111';
const EVM_ZERO = '0x0000000000000000000000000000000000000000';

export interface RouteParams {
  fromChainId: string;
  toChainId: string;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  fromAddress: string;
  toAddress: string;
  /** Fraction (0.005 = 0,5 %). */
  slippage?: number;
  /** Infos connues côté UI, pour compléter les providers qui ne les renvoient pas (Jupiter). */
  fromTokenInfo?: Partial<SwapTokenInfo>;
  toTokenInfo?: Partial<SwapTokenInfo>;
}

export function isEvmAddress(a: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(a);
}
export function isSolanaAddress(a: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a);
}

/** Complète symbole/décimales manquants (Jupiter renvoie decimals = -1). */
export function normalizeQuote(q: SwapQuote, p: RouteParams): SwapQuote {
  const fill = (t: SwapTokenInfo, info?: Partial<SwapTokenInfo>): SwapTokenInfo => ({
    ...t,
    symbol: t.symbol || info?.symbol || '',
    decimals: t.decimals >= 0 ? t.decimals : info?.decimals ?? 18,
    logo: t.logo ?? info?.logo,
  });
  return { ...q, fromToken: fill(q.fromToken, p.fromTokenInfo), toToken: fill(q.toToken, p.toTokenInfo) };
}

/** Meilleur devis = plus gros montant garanti (`toAmountMin`). */
export function pickBest(quotes: SwapQuote[]): SwapQuote | null {
  if (quotes.length === 0) return null;
  return [...quotes].sort((a, b) => (b.toAmountMin > a.toAmountMin ? 1 : b.toAmountMin < a.toAmountMin ? -1 : 0))[0];
}

export async function getBestQuote(params: RouteParams): Promise<SwapQuote | null> {
  const fromChain = getAdapter(params.fromChainId).config;
  const toChain = getAdapter(params.toChainId).config;

  // Validation AVANT tout appel réseau : messages explicites.
  if (toChain.family === 'evm' && !isEvmAddress(params.toAddress)) {
    throw new SwapError('INVALID_ADDRESS', `Adresse de réception ${toChain.name} invalide`, { chain: toChain.name });
  }
  if (toChain.family === 'solana' && !isSolanaAddress(params.toAddress)) {
    throw new SwapError('INVALID_ADDRESS', 'Ce portefeuille n’a pas d’adresse Solana', { chain: 'Solana' });
  }
  if (fromChain.family !== 'evm' && fromChain.family !== 'solana') {
    throw new SwapError('NO_ROUTE', `Swap non disponible depuis ${fromChain.name}`);
  }
  let amount: bigint;
  try {
    amount = BigInt(params.fromAmount);
  } catch {
    throw new SwapError('NO_ROUTE', 'Montant invalide');
  }
  if (amount <= 0n) throw new SwapError('NO_ROUTE', 'Montant invalide');

  const sameChain = params.fromChainId === params.toChainId;
  const toLifiToken = (addr: string, family: string) => (addr === EVM_ZERO && family === 'solana' ? SOL_NATIVE : addr);
  const lifiChainId = (family: string, evmId?: number) => (family === 'solana' ? LIFI_SOLANA : evmId ?? 1);

  const errors: SwapError[] = [];
  const tasks: Promise<SwapQuote | null>[] = [];
  const run = (fn: () => Promise<SwapQuote | null>) =>
    tasks.push(
      fn().catch((e) => {
        errors.push(e instanceof SwapError ? e : new SwapError('NETWORK', e instanceof Error ? e.message : 'network'));
        return null;
      }),
    );

  // 1) LI.FI — toujours.
  run(() =>
    getLifiQuote({
      fromChainId: lifiChainId(fromChain.family, fromChain.evmChainId),
      toChainId: lifiChainId(toChain.family, toChain.evmChainId),
      fromToken: toLifiToken(params.fromToken, fromChain.family),
      toToken: toLifiToken(params.toToken, toChain.family),
      fromAmount: amount,
      fromAddress: params.fromAddress,
      toAddress: params.toAddress,
      slippage: params.slippage,
    }),
  );

  // 2) Jupiter — intra-Solana.
  if (sameChain && fromChain.family === 'solana') {
    run(() =>
      getJupiterQuote({
        fromChainId: params.fromChainId,
        toChainId: params.toChainId,
        fromToken: params.fromToken,
        toToken: params.toToken,
        fromAmount: amount,
        fromAddress: params.fromAddress,
        slippage: params.slippage,
      }),
    );
  }

  // 3) Relay — cross-chain depuis l'EVM, si clé API.
  if (!sameChain && fromChain.family === 'evm' && relayEnabled()) {
    run(() =>
      getRelayQuote({
        fromChainId: fromChain.relayId ?? String(fromChain.evmChainId),
        toChainId: toChain.relayId ?? (toChain.evmChainId ? String(toChain.evmChainId) : toChain.id),
        fromToken: params.fromToken,
        toToken: toLifiToken(params.toToken, toChain.family),
        fromAmount: params.fromAmount,
        fromAddress: params.fromAddress,
        toAddress: params.toAddress,
        slippage: params.slippage,
      }),
    );
  }

  const results = await Promise.all(tasks);
  const quotes = results.filter((q): q is SwapQuote => q !== null).map((q) => normalizeQuote(q, params));
  const best = pickBest(quotes);
  if (best) return best;

  throw pickMostRelevant(errors) ?? new SwapError('NO_ROUTE', 'Aucune route trouvée.');
}

export * from './swapError';
export * from './lifi';
export * from './relay';
export * from './jupiter';
