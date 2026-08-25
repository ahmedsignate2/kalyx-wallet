/**
 * Client pour l'API Relay (relay.link) — le moteur Cross-VM intent-based de Nova.
 * Utilisé pour :
 * - EVM ↔ Solana
 * - EVM ↔ Bitcoin
 * - Solana ↔ Bitcoin
 */
import { SwapError } from './swapError';
import type { SwapQuote, SwapTxRequest } from './lifi';

export interface RelayQuoteParams {
  /** L'ID Relay de la chaîne source (ex: "1" pour Ethereum, "solana" pour Solana) */
  fromChainId: string;
  /** L'ID Relay de la chaîne cible */
  toChainId: string;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  /** L'adresse de réception sur la chaîne cible (le format doit correspondre à la VM cible) */
  toAddress: string;
}

const RELAY_API = 'https://api.relay.link';

/**
 * Interroge l'API Relay pour un devis Cross-VM.
 */
export async function getRelayQuote(params: RelayQuoteParams): Promise<SwapQuote | null> {
  try {
    const isOriginSolana = params.fromChainId === '792703809' || params.fromChainId === 'solana';
    const isDestSolana = params.toChainId === '792703809' || params.toChainId === 'solana';
    
    const body = {
      user: params.toAddress, // recipient is used as user to get full tx
      originChainId: isOriginSolana ? 792703809 : Number(params.fromChainId),
      destinationChainId: isDestSolana ? 792703809 : Number(params.toChainId),
      originCurrency: params.fromToken,
      destinationCurrency: params.toToken,
      amount: params.fromAmount,
      recipient: params.toAddress,
      tradeType: 'EXACT_INPUT',
      referrer: 'nova'
    };

    const relayKey = process.env.EXPO_PUBLIC_RELAY_API_KEY;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (relayKey) headers['Authorization'] = `Bearer ${relayKey}`;

    const res = await fetch(`${RELAY_API}/quote`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new SwapError('NO_ROUTE', err.message || 'Erreur Relay API');
    }

    const data = await res.json();
    const details = data.details;
    if (!details || !data.steps || data.steps.length === 0) return null;

    const currencyIn = details.currencyIn;
    const currencyOut = details.currencyOut;
    const stepItem = data.steps[0].items[0];
    
    if (!stepItem || !stepItem.data) return null;

    // Frais de plateforme (0.3%) intégrés par Relay si referrer passé ?
    // S'il n'y a pas de support natif des fees par Relay, on prend sur le toAmount
    const outAmount = BigInt(currencyOut.amount);
    const outAmountMin = BigInt(currencyOut.minimumAmount);

    let txRequest: SwapTxRequest;
    if (isOriginSolana) {
      txRequest = {
        type: 'solana',
        data: JSON.stringify(stepItem.data) // Contient les instructions, géré par l'exécuteur
      };
    } else {
      txRequest = {
        type: 'evm',
        to: stepItem.data.to,
        data: stepItem.data.data,
        value: BigInt(stepItem.data.value || 0),
        chainId: stepItem.data.chainId,
        gasLimit: stepItem.data.gas ? BigInt(stepItem.data.gas) : undefined,
      };
    }

    return {
      fromAmount: BigInt(currencyIn.amount),
      toAmount: outAmount,
      toAmountMin: outAmountMin,
      fromToken: { address: params.fromToken, symbol: currencyIn.currency.symbol, decimals: currencyIn.currency.decimals },
      toToken: { address: params.toToken, symbol: currencyOut.currency.symbol, decimals: currencyOut.currency.decimals },
      approvalAddress: null, // Intent-based usually doesn't need external approval if using permit, or it's bundled
      toolName: 'Relay',
      gasCostUsd: 0,
      gasCostNative: 0n,
      gasToken: null,
      feeCostUsd: 0,
      durationSec: 15,
      fromAmountUsd: parseFloat(currencyIn.amountUsd || '0'),
      toAmountUsd: parseFloat(currencyOut.amountUsd || '0'),
      slippage: 0.005,
      tx: txRequest,
    };
  } catch (e) {
    if (e instanceof SwapError) throw e;
    return null;
  }
}
