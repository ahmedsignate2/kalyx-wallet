/**
 * Traduit une erreur de transaction (ethers/RPC/swap) en message clair pour
 * l'utilisateur — au lieu d'un vague « erreur réseau ».
 *
 * Accepte un `t` optionnel pour les traductions i18n. Sans `t`, renvoie
 * la clé i18n brute (fallback anglais dans le dictionnaire).
 */
import { isWalletError, SwapError } from '../src';

export type TFn = (key: any) => string;

export function friendlyTxError(e: unknown, t?: TFn): string {
  console.error('[txError] Raw error interceptée:', typeof e === 'object' ? JSON.stringify(e, Object.getOwnPropertyNames(e)) : e);
  // SwapError : diagnostic précis (minimum, liquidité, slippage, gas).
  if (e instanceof SwapError) {
    switch (e.code) {
      case 'AMOUNT_BELOW_MINIMUM':
        return t ? t('errAmountBelowMin') : `Minimum required: ${e.meta?.min ?? '?'}`;
      case 'NO_LIQUIDITY':
        return t ? t('errNoLiquidity') : 'No liquidity available for this pair.';
      case 'NO_ROUTE':
        return t ? t('errNoRoute') : 'No route found. Try a different amount or pair.';
      case 'SLIPPAGE_TOO_HIGH':
        return t ? t('errSlippageHigh') : 'Price moved too much (slippage). Request a new quote.';
      case 'INSUFFICIENT_GAS':
        return t ? t('errInsufficientGas') : 'Insufficient balance to cover gas fees.';
    }
  }

  if (isWalletError(e)) {
    if (e.code === 'WRONG_PIN') return t ? t('errWrongPin') : 'Incorrect PIN.';
    if (e.code === 'RPC_UNAVAILABLE') return t ? t('errRpcUnavailable') : 'Network unavailable. Try again.';
    return e.message;
  }
  const err = e as { code?: string | number; shortMessage?: string; info?: { error?: { message?: string } }; message?: string };
  const msg = (err?.info?.error?.message || err?.shortMessage || err?.message || '').toLowerCase();

  if (err?.code === 'INSUFFICIENT_FUNDS' || msg.includes('insufficient funds') || msg.includes('insufficient balance') || msg.includes('attempt to debit an account but found no record')) {
    return t ? t('errInsufficientFunds') : 'Insufficient balance to cover the amount and network fees.';
  }
  if (msg.includes('simulation failed') || msg.includes('custom program error')) {
    return t ? t('errCallException') : 'Transaction failed (contract). Check the amount or allowance.';
  }
  if (msg.includes('blockhash not found')) return 'Devis expiré (Blockhash). Veuillez annuler et rafraîchir le devis.';
  if (msg.includes('user rejected') || msg.includes('rejected')) return t ? t('errUserRejected') : 'Transaction cancelled.';
  if (msg.includes('invalid psbt') || msg.includes('idx') || msg.includes('not a valid base64')) return t ? t('errInvalidPsbt') : 'Invalid PSBT.';
  if (msg.includes('nonce')) return t ? t('errNonce') : 'Transaction conflict (nonce). Try again shortly.';
  if (msg.includes('replacement') || msg.includes('underpriced')) return t ? t('errUnderpriced') : 'Fee too low or duplicate transaction. Try again.';
  if (msg.includes('slippage') || msg.includes('min return') || msg.includes('too little received')) {
    return t ? t('errSlippage') : 'Price moved (slippage). Request a new quote.';
  }
  if (err?.code === 'CALL_EXCEPTION' || msg.includes('execution reverted') || msg.includes('simulation failed') || msg.includes('blockhash not found') || msg.includes('custom program error')) {
    return t ? t('errCallException') : 'Transaction failed (contract). Check the amount or allowance.';
  }
  if (msg.includes('timeout') || msg.includes('network') || msg.includes('failed to fetch')) {
    return t ? t('errNetwork') : 'Network unavailable. Check your connection and try again.';
  }
  return (t ? t('errGenericTxFail') : 'Transaction failed. Try again.') + ' (' + msg.substring(0, 50) + ')';
}
