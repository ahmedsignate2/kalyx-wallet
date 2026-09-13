/**
 * Relay (relay.link) — provider cross-chain OPTIONNEL, activé uniquement si
 * `EXPO_PUBLIC_RELAY_API_KEY` est renseignée (l'API refuse les devis anonymes
 * depuis 2025 : `UNAUTHORIZED_QUOTE`). LI.FI couvre déjà EVM ↔ Solana (Mayan,
 * Across, et Relay lui-même comme bridge) : Relay n'est qu'une 2ᵉ source.
 *
 * Limites assumées :
 *  - Origine Solana non supportée ici (Relay renvoie des INSTRUCTIONS à
 *    assembler, pas une tx signable) → `null`, LI.FI prend le relais.
 *  - Origine ERC-20 : Relay renvoie une étape `approve` puis `deposit` ; on
 *    expose l'approve via `approvalAddress` et on exécute l'étape principale.
 */
import { withTimeout } from '../chains/net';
import { SwapError } from './swapError';
import type { SwapQuote, SwapTxRequest } from './lifi';

export interface RelayQuoteParams {
  /** Id Relay de la chaîne source ("1" Ethereum, "792703809" Solana). */
  fromChainId: string;
  toChainId: string;
  fromToken: string;
  toToken: string;
  fromAddress: string;
  fromAmount: string;
  /** Adresse de réception sur la chaîne cible (format de la VM cible). */
  toAddress: string;
  slippage?: number;
}

const RELAY_API = 'https://api.relay.link';
const RELAY_SOLANA = '792703809';
const TIMEOUT = 15_000;
const KEY = (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_RELAY_API_KEY) || '';

export function relayEnabled(): boolean {
  return KEY.length > 0;
}

/** Spender d'un calldata `approve(address,uint256)` (0x095ea7b3 + 32 octets). */
export function approveSpender(data: string): string | null {
  if (!/^0x095ea7b3[0-9a-f]{128}$/i.test(data)) return null;
  return '0x' + data.slice(34, 74);
}

export function parseRelayError(status: number, json: unknown): SwapError {
  const j = (json ?? {}) as { message?: string; errorCode?: string };
  const msg = String(j.message ?? '');
  const code = String(j.errorCode ?? '');
  if (status === 429) return new SwapError('RATE_LIMITED', msg);
  if (status >= 500) return new SwapError('PROVIDER_UNAVAILABLE', msg || `Relay ${status}`);
  if (code === 'UNAUTHORIZED_QUOTE' || status === 401) return new SwapError('PROVIDER_UNAVAILABLE', 'Relay: clé API requise');
  if (/amount.*(low|small|minimum)/i.test(msg)) return new SwapError('AMOUNT_BELOW_MINIMUM', msg);
  if (/amount.*(high|large|maximum)/i.test(msg)) return new SwapError('AMOUNT_ABOVE_MAXIMUM', msg);
  if (/liquidity/i.test(msg)) return new SwapError('NO_LIQUIDITY', msg);
  if (/unsupported|not supported|invalid currency/i.test(msg)) return new SwapError('INVALID_TOKEN', msg);
  return new SwapError('NO_ROUTE', msg || `Relay ${status}`);
}

export async function getRelayQuote(params: RelayQuoteParams): Promise<SwapQuote | null> {
  if (!relayEnabled()) return null;
  const isOriginSolana = params.fromChainId === RELAY_SOLANA || params.fromChainId === 'solana';
  const isDestSolana = params.toChainId === RELAY_SOLANA || params.toChainId === 'solana';
  if (isOriginSolana) return null; // instructions non assemblées — voir en-tête

  const body = {
    user: params.fromAddress,
    originChainId: Number(params.fromChainId),
    destinationChainId: isDestSolana ? Number(RELAY_SOLANA) : Number(params.toChainId),
    originCurrency: params.fromToken,
    destinationCurrency: params.toToken,
    amount: params.fromAmount,
    recipient: params.toAddress,
    tradeType: 'EXACT_INPUT',
    referrer: 'nova',
    slippageTolerance: params.slippage && params.slippage > 0 ? String(Math.round(params.slippage * 10_000)) : undefined,
  };

  try {
    const res = await withTimeout(
      fetch(`${RELAY_API}/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
        body: JSON.stringify(body),
      }),
      TIMEOUT,
      () => new Error('timeout'),
    );
    if (!res.ok) throw parseRelayError(res.status, await res.json().catch(() => ({})));

    const data = await res.json();
    const details = data?.details;
    const steps: { id?: string; kind?: string; items?: { data?: Record<string, unknown> }[] }[] = data?.steps ?? [];
    if (!details || steps.length === 0) return null;

    const approve = steps.find((s) => s.id === 'approve');
    const main = steps.find((s) => s.id !== 'approve') ?? steps[0];
    const item = main.items?.[0];
    const d = item?.data as { to?: string; data?: string; value?: string; chainId?: number; gas?: string } | undefined;
    if (!d?.to || !d.data) return null;

    const approveData = String((approve?.items?.[0]?.data as { data?: string } | undefined)?.data ?? '');
    const approvalAddress = approve ? approveSpender(approveData) : null;
    if (approve && !approvalAddress) return null; // approve non décodable → on laisse LI.FI

    const currencyIn = details.currencyIn;
    const currencyOut = details.currencyOut;
    const tx: SwapTxRequest = {
      type: 'evm',
      to: d.to,
      data: d.data,
      value: BigInt(d.value || 0),
      chainId: Number(d.chainId ?? params.fromChainId),
      gasLimit: d.gas ? BigInt(d.gas) : undefined,
    };
    const feesUsd = Object.values((data.fees ?? {}) as Record<string, { amountUsd?: string }>).reduce(
      (s, f) => s + (Number(f?.amountUsd) || 0),
      0,
    );

    return {
      fromAmount: BigInt(currencyIn.amount),
      toAmount: BigInt(currencyOut.amount),
      toAmountMin: BigInt(currencyOut.minimumAmount ?? currencyOut.amount),
      fromToken: { address: params.fromToken, symbol: String(currencyIn.currency?.symbol ?? '').toUpperCase(), decimals: Number(currencyIn.currency?.decimals ?? -1) },
      toToken: { address: params.toToken, symbol: String(currencyOut.currency?.symbol ?? '').toUpperCase(), decimals: Number(currencyOut.currency?.decimals ?? -1) },
      approvalAddress,
      toolName: 'Relay',
      gasCostUsd: Number(data.fees?.gas?.amountUsd) || 0,
      gasCostNative: BigInt(data.fees?.gas?.amount ?? 0),
      gasToken: null,
      feeCostUsd: feesUsd,
      durationSec: Number(details.timeEstimate) || 15,
      fromAmountUsd: parseFloat(currencyIn.amountUsd || '0'),
      toAmountUsd: parseFloat(currencyOut.amountUsd || '0'),
      slippage: params.slippage ?? 0.005,
      tx,
    };
  } catch (e) {
    if (e instanceof SwapError) throw e;
    throw new SwapError('NETWORK', e instanceof Error ? e.message : 'network');
  }
}
