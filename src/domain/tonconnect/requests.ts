/**
 * TON Connect — requêtes d'une dApp connectée, lues et contrôlées AVANT d'être
 * montrées à l'utilisateur.
 *
 * `sendTransaction` : `params[0]` est une chaîne JSON (forme relevée dans
 * `@tonconnect/sdk` 4.0.2, `buildMessagesRpcPayload`) :
 *   { valid_until, network?, from?, messages: [{ address, amount, payload?, stateInit?, extra_currency? }] }
 *
 * Tout ce qui ne correspond pas au compte connecté est refusé, pas corrigé :
 * un autre réseau, un autre expéditeur, une requête déjà expirée. Une adresse
 * de destination doit être CONVIVIALE (la spec refuse la forme brute) : son
 * drapeau « rebondissant » décide du rebond, comme chez les autres wallets.
 */
import { Cell, loadStateInit, type StateInit } from '@ton/core';
import { parseRawTonAddress, parseTonAddress, toRawTonAddress } from '../chains/ton/tonAddress';
import { TON_MAINNET_ID, TON_TESTNET_ID } from './tonProof';

/** Codes d'erreur de `sendTransaction` (`SEND_TRANSACTION_ERROR_CODES`). */
export const TC_ERROR = { UNKNOWN: 0, BAD_REQUEST: 1, UNKNOWN_APP: 100, USER_REJECTS: 300, METHOD_NOT_SUPPORTED: 400 } as const;

/** Messages par transaction que Kalyx annonce (`SendTransaction.maxMessages`). */
export const TC_MAX_MESSAGES = 4;

export interface DappMessage {
  /** Adresse conviviale, telle que la dApp l'a donnée. */
  to: string;
  amount: bigint;
  bounce: boolean;
  payload?: Cell;
  init?: StateInit;
}

export interface DappTransaction {
  messages: DappMessage[];
  /** Échéance en secondes, ou null si la dApp n'en fixe pas. */
  validUntil: number | null;
}

export type ParseResult = { ok: true; tx: DappTransaction } | { ok: false; code: number; message: string };

const fail = (message: string, code: number = TC_ERROR.BAD_REQUEST): ParseResult => ({ ok: false, code, message });

function cell(b64: unknown, what: string): Cell | undefined {
  if (b64 == null || b64 === '') return undefined;
  if (typeof b64 !== 'string') throw new Error(`${what} illisible`);
  // base64 standard ou url : le SDK normalise, d'autres clients non.
  return Cell.fromBase64(b64.replace(/-/g, '+').replace(/_/g, '/'));
}

export function parseSendTransaction(
  param: unknown,
  ctx: { address: string; testnet: boolean; nowSeconds: number },
): ParseResult {
  let req: any;
  try {
    req = typeof param === 'string' ? JSON.parse(param) : null;
  } catch {
    return fail('requête illisible');
  }
  if (!req || typeof req !== 'object') return fail('requête illisible');
  if (Array.isArray(req.items)) return fail('éléments structurés non pris en charge', TC_ERROR.METHOD_NOT_SUPPORTED);

  const network = req.network == null ? null : String(req.network);
  if (network && network !== (ctx.testnet ? TON_TESTNET_ID : TON_MAINNET_ID)) return fail('réseau différent du compte connecté');

  const me = parseTonAddress(ctx.address) ?? parseRawTonAddress(ctx.address.toLowerCase());
  if (req.from != null) {
    const from = parseTonAddress(String(req.from)) ?? parseRawTonAddress(String(req.from).toLowerCase());
    if (!from || !me || toRawTonAddress(from) !== toRawTonAddress(me)) return fail('expéditeur différent du compte connecté');
  }

  let validUntil: number | null = null;
  if (req.valid_until != null) {
    validUntil = Number(req.valid_until);
    // Certaines dApps envoient des millisecondes : on les ramène en secondes.
    if (validUntil > 1e11) validUntil = Math.floor(validUntil / 1000);
    if (!Number.isFinite(validUntil) || validUntil <= 0) return fail('échéance invalide');
    if (validUntil < ctx.nowSeconds) return fail('requête expirée');
  }

  const list = req.messages;
  if (!Array.isArray(list) || list.length === 0) return fail('aucun message');
  if (list.length > TC_MAX_MESSAGES) return fail(`plus de ${TC_MAX_MESSAGES} messages`);

  const messages: DappMessage[] = [];
  for (const m of list) {
    if (typeof m?.address !== 'string') return fail('adresse manquante');
    const dest = parseTonAddress(m.address);
    if (!dest) return fail('adresse de destination invalide (forme conviviale attendue)');
    if (dest.testnet && !ctx.testnet) return fail('adresse du réseau de test');
    if (typeof m.amount !== 'string' || !/^\d{1,30}$/.test(m.amount)) return fail('montant invalide');
    const extra = m.extra_currency ?? m.extraCurrency;
    if (extra && typeof extra === 'object' && Object.keys(extra).length > 0) return fail('devises supplémentaires non prises en charge', TC_ERROR.METHOD_NOT_SUPPORTED);
    try {
      const init = cell(m.stateInit ?? m.state_init, 'stateInit');
      messages.push({
        to: m.address,
        amount: BigInt(m.amount),
        bounce: dest.bounceable,
        payload: cell(m.payload, 'payload'),
        init: init ? loadStateInit(init.beginParse()) : undefined,
      });
    } catch {
      return fail('contenu de message illisible');
    }
  }
  return { ok: true, tx: { messages, validUntil } };
}

/** Somme de TON qui quitte le portefeuille, frais non compris. */
export function totalOut(tx: DappTransaction): bigint {
  return tx.messages.reduce((s, m) => s + m.amount, 0n);
}
