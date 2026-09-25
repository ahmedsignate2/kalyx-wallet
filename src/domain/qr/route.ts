/**
 * Routage d'un résultat QR (pur, testable) : famille de chaîne cible, résolution
 * de la chaîne EVM par chainId, et description lisible pour l'écran de
 * confirmation. AUCUNE navigation ni exécution ici — l'UI décide après accord.
 */
import type { QrResult } from './parse';

export type QrFamily = 'evm' | 'bitcoin' | 'solana';

/** Famille de chaîne requise pour agir sur ce QR (null si non transactionnel). */
export function qrTargetFamily(result: QrResult): QrFamily | null {
  switch (result.kind) {
    case 'evm-address':
    case 'ethereum-uri':
      return 'evm';
    case 'bitcoin-address':
    case 'bitcoin-uri':
      return 'bitcoin';
    case 'solana-address':
    case 'solana-uri':
      return 'solana';
    default:
      return null;
  }
}

/** Id de chaîne Kalyx correspondant à un chainId EVM (ou null si inconnu). */
export function kalyxChainIdForEvm(
  chainId: number | undefined,
  chains: { id: string; evmChainId?: number }[],
): string | null {
  if (!chainId) return null;
  return chains.find((c) => c.evmChainId === chainId)?.id ?? null;
}

export interface QrDescription {
  /** Titre court (type d'intention). */
  title: string;
  /** Détail affiché (adresse, URL, montant) — TOUJOURS montré avant d'agir. */
  detail: string;
  /** Libellé du bouton d'action, ou null si aucune action possible. */
  cta: string | null;
  /** true = demande une vigilance particulière (lien externe, invalide). */
  danger: boolean;
}

/**
 * Clés de traduction utilisées par `describeQr`.
 *
 * Le traducteur est INJECTÉ et non importé : ce module est pur et testable, et
 * `lib/i18n` tirerait react-native dans les tests. Il est aussi devenu
 * obligatoire — cette fonction retournait des libellés français en dur, si bien
 * que la feuille de confirmation du scanner restait en français quelle que soit
 * la langue choisie. C'est le seul écran où l'utilisateur relit ce qu'il va
 * payer : il doit le lire dans sa langue.
 */
export type QrTranslate = (key: QrLabelKey) => string;

export type QrLabelKey =
  | 'qrEvmAddress'
  | 'qrSolanaAddress'
  | 'qrBitcoinAddress'
  | 'qrPayEvm'
  | 'qrPayBitcoin'
  | 'qrPaySolana'
  | 'qrPaySpl'
  | 'qrToken'
  | 'qrWcTitle'
  | 'qrWcDetail'
  | 'qrPayTitle'
  | 'qrPayDetail'
  | 'qrSolanaTxRequest'
  | 'qrLightningOnly'
  | 'qrLightningOnlyBody'
  | 'qrOpenSite'
  | 'qrOpenInBrowser'
  | 'qrNotRecognized'
  | 'qrEmpty'
  | 'actionSend'
  | 'next'
  | 'connect'
  | 'amount'
  | 'payRequestFrom';

/** Résumé lisible de ce qui a été scanné (sécurité : on montre toujours). */
export function describeQr(result: QrResult, t: QrTranslate): QrDescription {
  /** Adresse + lignes de détail non vides, dans l'ordre de lecture. */
  const lines = (...rest: (string | undefined)[]) =>
    [result.kind === 'invalid' ? '' : (result as { address?: string }).address ?? '', ...rest]
      .filter(Boolean)
      .join('\n');

  switch (result.kind) {
    case 'evm-address':
      return { title: t('qrEvmAddress'), detail: result.address, cta: t('actionSend'), danger: false };
    case 'solana-address':
      return { title: t('qrSolanaAddress'), detail: result.address, cta: t('actionSend'), danger: false };
    case 'bitcoin-address':
      return { title: t('qrBitcoinAddress'), detail: result.address, cta: t('actionSend'), danger: false };
    case 'ethereum-uri':
      /*
       * Le contrat est affiché quand il y en a un. Sans lui, une facture en
       * USDC et un envoi d'ETH se présentaient à l'identique : même titre,
       * même adresse, aucun moyen de voir en quoi on allait payer.
       *
       * Le montant d'un `transfer` (`amountRaw`) n'est PAS affiché ici : il est
       * en unités de base et les décimales du jeton ne sont pas connues de ce
       * module. Il apparaît sur l'écran d'envoi, converti.
       */
      return {
        title: t('qrPayEvm'),
        detail: lines(
          result.contract ? `${t('qrToken')} : ${result.contract}` : undefined,
          result.amount ? `${t('amount')} : ${result.amount}` : undefined,
        ),
        cta: t('next'),
        danger: false,
      };
    case 'bitcoin-uri':
      return {
        title: t('qrPayBitcoin'),
        detail: lines(
          result.label ? `${t('payRequestFrom')} : ${result.label}` : undefined,
          result.amount ? `${t('amount')} : ${result.amount} BTC` : undefined,
          result.message,
        ),
        cta: t('next'),
        danger: false,
      };
    case 'solana-uri':
      return {
        title: result.splToken ? t('qrPaySpl') : t('qrPaySolana'),
        detail: lines(
          // Le bénéficiaire et le motif étaient lus pour Bitcoin et ignorés
          // ici : l'utilisateur ne voyait ni à qui il payait, ni pourquoi.
          result.label ? `${t('payRequestFrom')} : ${result.label}` : undefined,
          result.splToken ? `${t('qrToken')} : ${result.splToken}` : undefined,
          result.amount ? `${t('amount')} : ${result.amount}` : undefined,
          result.message,
        ),
        cta: t('next'),
        danger: false,
      };
    case 'walletconnect':
      return { title: t('qrWcTitle'), detail: t('qrWcDetail'), cta: t('connect'), danger: false };
    case 'wc-pay':
      return { title: t('qrPayTitle'), detail: t('qrPayDetail'), cta: t('next'), danger: false };
    case 'lightning-only':
      // Pas d'action possible : il n'y a rien à payer en chaîne.
      return { title: t('qrLightningOnly'), detail: t('qrLightningOnlyBody'), cta: null, danger: false };
    case 'solana-tx-request':
      /*
       * Marquée DANGEREUSE : on ne connaît pas encore le contenu de la
       * transaction, elle sera construite par le serveur. L'écran doit la
       * décoder et la montrer avant toute signature.
       */
      return { title: t('qrSolanaTxRequest'), detail: result.url, cta: t('next'), danger: true };
    case 'url':
      return { title: t('qrOpenSite'), detail: result.url, cta: t('qrOpenInBrowser'), danger: true };
    case 'invalid':
      return {
        title: t('qrNotRecognized'),
        detail: result.raw ? result.raw.slice(0, 80) : t('qrEmpty'),
        cta: null,
        danger: true,
      };
  }
}

/**
 * Intention d'envoi extraite d'un QR ou d'un lien profond.
 *
 * Volontairement SANS décimales : le lien de paiement n'en porte pas, et
 * l'endroit qui les connaît (le portefeuille de l'utilisateur) n'est pas ici.
 * Deviner 18 par défaut transformerait une facture d'1 USDC en 10^12 USDC.
 */
export interface SendIntent {
  /** Destinataire final (jamais le contrat, même sur un `…/transfer`). */
  to: string;
  /** Montant en unités UTILISATEUR, sûr à préremplir tel quel. */
  amount?: string;
  /** Montant en unités de BASE : l'appelant convertit une fois les décimales connues. */
  amountRaw?: string;
  /** Contrat ERC-20 demandé par le lien. */
  contract?: string;
  /** Mint SPL demandé par le lien. */
  mint?: string;
  /** Bénéficiaire annoncé (`label`) — informatif, jamais vérifié. */
  payee?: string;
  /**
   * Motif annoncé (`message` BIP-21 ou Solana Pay) — AFFICHAGE seul.
   *
   * Renommé depuis `memo`, qui prêtait à confusion : sur Solana, `memo` est une
   * instruction écrite ON-CHAIN, pas un texte d'interface. Confondre les deux
   * ferait inscrire dans la blockchain un libellé destiné à l'écran.
   */
  note?: string;
  /** Texte à inscrire ON-CHAIN (instruction SPL Memo de Solana Pay). */
  memo?: string;
  /**
   * Repères `reference` de Solana Pay : comptes non signataires en lecture
   * seule, ajoutés à la transaction pour que le marchand la retrouve.
   */
  references?: string[];
}

/**
 * Traduit un résultat de scan/lien en intention d'envoi, ou null si ce contenu
 * n'est pas un envoi (WalletConnect, URL, invalide).
 *
 * Existe pour que le scanner ET les liens profonds partagent EXACTEMENT le même
 * comportement. Le scanner faisait ce mapping à la main, dans l'écran, et il y
 * perdait le jeton : seuls `to` et `amount` étaient transmis, si bien qu'une
 * demande en USDC arrivait sur l'écran d'envoi de la pièce native, avec le bon
 * destinataire et le mauvais actif.
 */
export function sendIntentFor(result: QrResult): SendIntent | null {
  switch (result.kind) {
    case 'evm-address':
    case 'bitcoin-address':
    case 'solana-address':
      return { to: result.address };
    case 'ethereum-uri':
      return {
        to: result.address,
        amount: result.amount,
        amountRaw: result.amountRaw,
        contract: result.contract,
      };
    case 'bitcoin-uri':
      return {
        to: result.address,
        amount: result.amount,
        payee: result.label,
        note: result.message,
      };
    case 'solana-uri':
      /*
       * Le `amount` de Solana Pay est en unités DÉCIMALES du jeton (spec), pas
       * en unités de base : il est donc directement affichable, y compris avec
       * `spl-token`. L'écran de scan le jetait dans ce cas, par prudence mal
       * placée — le montant demandé disparaissait d'une facture en USDC.
       */
      return {
        to: result.address,
        amount: result.amount,
        mint: result.splToken,
        payee: result.label,
        note: result.message,
        memo: result.memo,
        references: result.reference,
      };
    default:
      return null;
  }
}
