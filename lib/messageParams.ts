/**
 * Paramètre « message » d'une demande de signature dApp — lu à UN seul endroit,
 * par la fenêtre qui le montre et par le code qui le signe. Deux lectures
 * différentes, c'était montrer l'adresse et signer « Hello ».
 */
import { WalletError } from '../src/domain/errors';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** solana_signMessage : `{ message }` (spec), ou variantes vues chez les dApps. */
export function solanaMessageParam(p: unknown): string | undefined {
  const pSafe: any = p ?? {};
  let msg = pSafe.message ?? pSafe.msg ?? pSafe.signMessage;
  if (!msg && Array.isArray(pSafe)) msg = pSafe[0]?.message ?? pSafe[0]?.msg ?? pSafe[0]?.signMessage ?? pSafe[0];
  if (!msg && typeof pSafe === 'string') msg = pSafe;
  return typeof msg === 'string' ? msg : undefined;
}

/** bitcoin_signMessage : `{ message }`, ou `[adresse, message]` (le dernier texte). */
export function bitcoinMessageParam(p: unknown): string | undefined {
  const pSafe: any = p ?? {};
  let msg = pSafe.message || pSafe[0]?.message;
  if (!msg && Array.isArray(pSafe)) msg = pSafe.filter((x: unknown) => typeof x === 'string').pop();
  if (!msg && typeof pSafe === 'string') msg = pSafe;
  return typeof msg === 'string' ? msg : undefined;
}

/** Satoshis (entier strictement positif) → montant BTC décimal, pour l'adaptateur. */
export function btcFromSats(raw: unknown): string {
  const str = typeof raw === 'number' && Number.isSafeInteger(raw) ? String(raw) : typeof raw === 'string' ? raw.trim() : '';
  if (!/^\d+$/.test(str) || BigInt(str) <= 0n) throw new WalletError('INVALID_AMOUNT', 'Montant Bitcoin invalide (satoshis entiers attendus)');
  const sats = BigInt(str);
  const frac = (sats % 100_000_000n).toString().padStart(8, '0').replace(/0+$/, '');
  return `${sats / 100_000_000n}${frac ? `.${frac}` : ''}`;
}
