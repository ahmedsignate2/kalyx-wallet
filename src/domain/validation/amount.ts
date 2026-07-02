/**
 * Validation et conversion des montants.
 *
 * On manipule toujours les montants on-chain en `bigint` (unité la plus petite,
 * ex. wei), jamais en `number` flottant (perte de précision = perte de fonds).
 * L'UI saisit une chaîne décimale ("0.5"), on la convertit en bigint via les
 * décimales du token.
 */
import { parseUnits, formatUnits } from 'ethers';
import { WalletError } from '../errors';

export interface ParsedAmount {
  /** Montant en plus petite unité (wei-like). */
  raw: bigint;
  /** Décimales du token utilisées pour la conversion. */
  decimals: number;
}

/**
 * Convertit une saisie décimale en bigint, ou lève une WalletError.
 * Rejette : vide, non numérique, négatif, zéro, trop de décimales.
 */
export function parseAmount(input: string, decimals: number): ParsedAmount {
  const value = (input ?? '').trim().replace(',', '.');

  if (value.length === 0) {
    throw new WalletError('INVALID_AMOUNT', 'Montant vide');
  }
  if (!/^\d*\.?\d*$/.test(value) || value === '.') {
    throw new WalletError('INVALID_AMOUNT', 'Montant non numérique');
  }

  const fraction = value.split('.')[1];
  if (fraction && fraction.length > decimals) {
    throw new WalletError(
      'INVALID_AMOUNT',
      `Trop de décimales (max ${decimals} pour ce token)`,
    );
  }

  let raw: bigint;
  try {
    raw = parseUnits(value, decimals);
  } catch {
    throw new WalletError('INVALID_AMOUNT', 'Montant invalide');
  }

  if (raw < 0n) {
    throw new WalletError('INVALID_AMOUNT', 'Montant négatif');
  }
  if (raw === 0n) {
    throw new WalletError('AMOUNT_TOO_SMALL', 'Le montant doit être supérieur à 0');
  }

  return { raw, decimals };
}

/**
 * Vérifie qu'un montant (+ frais éventuels) tient dans le solde.
 * Lève INSUFFICIENT_FUNDS sinon.
 */
export function assertSufficientFunds(params: {
  amount: bigint;
  balance: bigint;
  fee?: bigint;
}): void {
  const fee = params.fee ?? 0n;
  if (params.amount + fee > params.balance) {
    throw new WalletError(
      'INSUFFICIENT_FUNDS',
      'Solde insuffisant pour couvrir le montant et les frais',
    );
  }
}

/** Formate un bigint on-chain en chaîne lisible. */
export function formatAmount(raw: bigint, decimals: number): string {
  return formatUnits(raw, decimals);
}
