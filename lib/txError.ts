/**
 * Traduit une erreur de transaction (ethers/RPC/swap) en message clair pour
 * l'utilisateur — au lieu d'un vague « erreur réseau ».
 *
 * Accepte un `t` optionnel pour les traductions i18n. Sans `t`, renvoie
 * la clé i18n brute (fallback anglais dans le dictionnaire).
 */
import { isWalletError, isWcConnectError, SwapError } from '../src';
import { recordTechnicalLog } from './technicalLogger';

export type TFn = (key: any) => string;

/**
 * Message TRADUIT de chaque code d'erreur du portefeuille.
 *
 * `WalletError` porte un code ET un message, et ce message était écrit en
 * français dans le domaine — cinquante-sept fois. On le renvoyait tel quel à
 * l'utilisateur, donc l'app parlait français quelle que soit la langue choisie.
 *
 * Le code suffit à dire quoi afficher. La phrase française reste dans le JOURNAL
 * technique, où elle sert au diagnostic : elle porte souvent un détail précis
 * — quel mint, quelle entrée manquante — mais un détail dans une langue que
 * l'utilisateur ne lit pas ne l'aide pas. Quand un cas mérite vraiment son
 * message propre, il mérite son propre code : c'est ce qui a été fait pour
 * l'import de clés (`import.*`) et pour les refus de WalletConnect.
 */
const WALLET_ERROR_KEYS: Record<string, string> = {
  AMOUNT_TOO_SMALL: 'errAmountTooSmall',
  BIOMETRIC_NOT_SET: 'errBiometricNotSet',
  BIOMETRIC_REFUSED: 'errBiometricRefused',
  BROADCAST_FAILED: 'errBroadcastFailed',
  CALL_EXCEPTION: 'errCallException',
  INSUFFICIENT_FUNDS: 'errInsufficientFunds',
  INVALID_ADDRESS: 'errInvalidAddress',
  /*
   * Repli d'`INVALID_KEY` : les cas d'import portent un sous-code `import.*`
   * traité plus haut, mais un `INVALID_KEY` lancé sans ce préfixe retombait
   * sur la phrase française du domaine — le trou que le test a révélé.
   */
  INVALID_KEY: 'keyErrUnrecognised',
  INVALID_AMOUNT: 'errInvalidAmount',
  INVALID_MNEMONIC: 'errInvalidMnemonic',
  INVALID_PIN: 'errInvalidPin',
  MNEMONIC_VERIFICATION_FAILED: 'errMnemonicMismatch',
  NOT_SUPPORTED: 'errNotSupported',
  RPC_UNAVAILABLE: 'errRpcUnavailable',
  TX_EXPIRED: 'errTxExpired',
  TX_FAILED: 'errTxFailedOnChain',
  VAULT_CORRUPTED: 'errVaultCorrupted',
  WALLET_ALREADY_EXISTS: 'errWalletExists',
  WRONG_PIN: 'errWrongPin',
};

export function friendlyTxError(e: unknown, t?: TFn): string {
  /*
   * ÉCHEC DE CONNEXION D'UNE dApp, en premier parce qu'il porte un code et que
   * le reste de cette fonction devine à partir de messages. Le détail technique
   * suit la phrase traduite : « réseau non supporté » sans dire lequel oblige à
   * chercher, et c'est ce silence qui fait perdre des heures.
   */
  if (isWcConnectError(e)) {
    const key =
      e.code === 'NO_ACCOUNT'
        ? 'wcErrNoAccount'
        : e.code === 'UNSUPPORTED_REQUEST'
          ? 'wcErrUnsupported'
          : e.code === 'NO_COMPATIBLE_CHAIN'
            ? 'wcErrNoChain'
            : e.code === 'PROPOSAL_EXPIRED'
              ? 'wcErrExpired'
              : 'wcErrRelay';
    const phrase = t ? t(key) : e.code;
    return e.detail ? `${phrase} (${e.detail})` : phrase;
  }

  const errMsg = typeof e === 'object' && e ? (e as any)?.shortMessage || (e as any)?.message || 'Transaction error' : String(e);
  recordTechnicalLog('TX_ERROR', errMsg, typeof e === 'object' && e ? { code: (e as any)?.code, status: (e as any)?.status } : undefined);
  console.error('[txError] Raw error interceptée:', typeof e === 'object' ? JSON.stringify(e, Object.getOwnPropertyNames(e)) : e);
  // SwapError : diagnostic précis (minimum, liquidité, slippage, gas).
  if (e instanceof SwapError) {
    const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k) => e.meta?.[k] ?? '?');
    switch (e.code) {
      case 'AMOUNT_BELOW_MINIMUM':
        if (e.meta?.min && e.meta?.symbol) return t ? fill(t('errAmountBelowMinDetail')) : `Minimum ≈ ${e.meta.min} ${e.meta.symbol}`;
        return t ? t('errAmountBelowMin') : `Minimum required: ${e.meta?.min ?? '?'}`;
      case 'AMOUNT_ABOVE_MAXIMUM':
        if (e.meta?.max && e.meta?.symbol) return t ? fill(t('errAmountAboveMaxDetail')) : `Maximum ≈ ${e.meta.max} ${e.meta.symbol}`;
        return t ? t('errAmountAboveMax') : 'Amount too high for this route.';
      case 'NO_LIQUIDITY':
        return t ? t('errNoLiquidity') : 'No liquidity available for this pair.';
      case 'NO_ROUTE':
        return t ? t('errNoRoute') : 'No route found. Try a different amount or pair.';
      case 'INVALID_TOKEN':
        return t ? t('errInvalidToken') : 'This token cannot be swapped.';
      case 'INVALID_ADDRESS':
        return e.meta?.chain ? (t ? fill(t('errNoChainAddress')) : `No ${e.meta.chain} address on this wallet`) : e.message;
      case 'SLIPPAGE_TOO_HIGH':
        return t ? t('errSlippageHigh') : 'Price moved too much (slippage). Request a new quote.';
      case 'INSUFFICIENT_GAS':
        return t ? t('errInsufficientGas') : 'Insufficient balance to cover gas fees.';
      case 'INSUFFICIENT_FUNDS':
        return t ? t('errInsufficientFunds') : 'Insufficient balance.';
      case 'RATE_LIMITED':
        return t ? t('errRateLimited') : 'Too many requests. Try again in a few seconds.';
      case 'QUOTE_EXPIRED':
        return t ? t('errQuoteExpired') : 'Quote expired. Request a new quote.';
      case 'PROVIDER_UNAVAILABLE':
        return t ? t('errProviderUnavailable') : 'Swap service temporarily unavailable.';
      case 'NETWORK':
        return t ? t('errNetworkOffline') : 'Network unreachable. Check your connection.';
    }
  }

  if (isWalletError(e)) {
    /*
     * CODES D'IMPORT. Le magasin lève un `WalletError` dont le message est un
     * code préfixé `import.` : la raison précise change ce qu'il faut dire, et
     * une seule phrase pour six cas n'aide personne à s'en sortir. Sans cette
     * traduction, l'utilisateur lirait « import.WRONG_FAMILY:bitcoin:solana ».
     */
    if (e.message.startsWith('import.')) {
      const [code, have, want] = e.message.slice('import.'.length).split(':');
      switch (code) {
        case 'OUT_OF_RANGE':
          return t ? t('keyErrOutOfRange') : 'Key outside the valid range.';
        case 'BAD_CHECKSUM':
          return t ? t('keyErrChecksum') : 'Checksum mismatch.';
        case 'BAD_WIF_VERSION':
          return t ? t('keyErrWifVersion') : 'Unknown WIF version.';
        case 'SOLANA_MISMATCH':
          return t ? t('keyErrSolanaMismatch') : 'The public key does not match the private key.';
        case 'FAMILY_REQUIRED':
        case 'FAMILY_UNSUPPORTED':
          return t ? t('keyErrFamilyRequired') : 'Pick the network this key is for.';
        case 'WIF_UNCOMPRESSED':
          return t ? t('keyErrWifUncompressed') : 'Uncompressed WIF: legacy address, not supported.';
        case 'WRONG_FAMILY': {
          const phrase = t ? t('keyErrWrongFamily') : 'This wallet was imported for {have}. {want} is not available.';
          return phrase.split('{have}').join(have ?? '?').split('{want}').join(want ?? '?');
        }
        default:
          return t ? t('keyErrUnrecognised') : 'Key not recognised.';
      }
    }
    /*
     * TRADUCTION PAR CODE. Le repli précédent — `return e.message` — renvoyait la
     * phrase française écrite dans le domaine, dans toutes les langues.
     */
    const key = WALLET_ERROR_KEYS[e.code];
    if (key && t) return t(key);
    // Sans traducteur (appels hors interface), la phrase du domaine reste le
    // meilleur repli disponible.
    return e.message;
  }
  const err = e as { code?: string | number; shortMessage?: string; info?: { error?: { message?: string } }; message?: string };
  const msg = (err?.info?.error?.message || err?.shortMessage || err?.message || '').toLowerCase();

  if (err?.code === 'INSUFFICIENT_FUNDS' || msg.includes('insufficient funds') || msg.includes('insufficient balance') || msg.includes('attempt to debit an account but found no record')) {
    return t ? t('errInsufficientFunds') : 'Insufficient balance to cover the amount and network fees.';
  }
  if (msg.includes('missing revert data') || (msg.includes('estimategas') && err?.code === 'CALL_EXCEPTION')) {
    // Traduit : ce message-ci était écrit en français en dur.
    return t ? t('errSimulationRefused') : 'The contract refused the simulation (missing allowance, changed balance, or expired quote). Request a new quote.';
  }
  if (msg.includes('simulation failed') || msg.includes('custom program error')) {
    return t ? t('errCallException') : 'Transaction failed (contract). Check the amount or allowance.';
  }
  if (msg.includes('blockhash not found') || msg.includes('devis expiré')) return t ? t('errQuoteExpired') : 'Quote expired. Request a new quote.';
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
  if (msg.includes('timeout') || msg.includes('network') || msg.includes('failed to fetch') || msg.includes('network request failed')) {
    return t ? t('errNetworkOffline') : 'Network unavailable. Check your connection and try again.';
  }
  // Messages déjà rédigés pour l'utilisateur (simulation Solana, Earn) : on les garde tels quels.
  if (/^(solde|simulation|le prix|transaction échouée on-chain|confirmation non reçue|diffusion refusée|l'autorisation|la simulation)/i.test(err?.message ?? '')) {
    return err!.message!;
  }
  return (t ? t('errGenericTxFail') : 'Transaction failed. Try again.') + ' (' + msg.substring(0, 50) + ')';
}
