/**
 * MODE COMPAGNON — la partie pure (testée sans réseau).
 *
 * Les clés restent sur le téléphone : l'extension n'est qu'une fenêtre. Elle
 * se relie à l'app Kalyx par WalletConnect (l'extension propose, le téléphone
 * accepte), ne reçoit que des adresses PUBLIQUES, et transmet chaque
 * signature au téléphone, qui la montre et la fait valider (PIN, biométrie).
 *
 * Ce que l'extension vérifie quand même, parce qu'un relais ou une session
 * détournée ne doit rien pouvoir lui faire avaler :
 *  - les adresses partagées sont bien formées, une seule par famille ;
 *  - chaque SIGNATURE rendue est vérifiée contre l'adresse du compte : une
 *    signature d'une autre clé est refusée avant d'atteindre le site ;
 *  - un hachage de transaction ou une signature Solana a la forme attendue.
 */
import { verifyMessage, verifyTypedData, getBytes, isHexString } from 'ethers';
import { ed25519 } from '@noble/curves/ed25519';
import { base58, base64 } from '@scure/base';
import { RpcError } from './rpcError';
import { isValidBtcAddress } from '../../src/domain/validation/btcAddress';

export const SOLANA_CAIP = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
export const EVM_METHODS = ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4'];
export const SOL_METHODS = ['solana_signMessage', 'solana_signTransaction', 'solana_signAllTransactions', 'solana_signAndSendTransaction'];
/** Bitcoin (WalletConnect « bip122 », réseau principal) : envoi, montant en satoshis, signé et diffusé par le téléphone. */
export const BTC_CAIP = 'bip122:000000000019d6689c085ae165831e93';
export const BTC_METHODS = ['sendTransfer'];

/** Ce que l'extension propose au téléphone : les réseaux EVM qu'elle connaît, et Solana. Tout est optionnel : le téléphone partage ce qu'il a. */
export function proposal(evmChainIds: number[]) {
  const chains = [...new Set(evmChainIds.filter((n) => Number.isSafeInteger(n) && n > 0))].map((n) => `eip155:${n}`);
  return {
    optionalNamespaces: {
      eip155: { chains, methods: EVM_METHODS, events: ['accountsChanged', 'chainChanged'] },
      solana: { chains: [SOLANA_CAIP], methods: SOL_METHODS, events: [] as string[] },
      bip122: { chains: [BTC_CAIP], methods: BTC_METHODS, events: [] as string[] },
    },
    // Marque « c'est l'extension Kalyx » : l'app partage alors TOUS ses portefeuilles et comptes, avec leur carte.
    sessionProperties: { kalyx_companion: '2' },
  };
}

/** Un compte d'un portefeuille du téléphone (adresses publiques). */
export interface PhoneAccount {
  index: number;
  label: string;
  evm?: string;
  solana?: string;
  bitcoin?: string;
  tonPub?: string;
}
export interface PhoneWallet {
  /** Identifiant opaque du portefeuille sur le téléphone (pour le reconnaître à la prochaine liaison). */
  key: string;
  label: string;
  accounts: PhoneAccount[];
}

/**
 * Les portefeuilles du téléphone, rangés comme dans l'app. La carte vient de
 * `sessionProperties.kalyx_accounts` ; on n'y croit QUE pour des adresses que
 * la session partage vraiment (une carte ne peut rien ajouter, seulement
 * ranger). Sans carte (app plus ancienne) : un seul compte, comme avant.
 */
export function companionWallets(ns: Namespaces, props?: Record<string, unknown> | null): { wallets: PhoneWallet[]; evmChains: number[] } {
  const raw = typeof props?.kalyx_accounts === 'string' && props.kalyx_accounts.length <= 60_000 ? props.kalyx_accounts : null;
  let entries: unknown = null;
  try {
    entries = raw ? JSON.parse(raw) : null;
  } catch {
    entries = null;
  }
  if (!Array.isArray(entries)) {
    const one = sessionAccounts(ns);
    const accounts = one.evm || one.solana || one.bitcoin ? [{ index: 0, label: 'Compte 1', evm: one.evm, solana: one.solana, bitcoin: one.bitcoin }] : [];
    return { wallets: accounts.length ? [{ key: 'phone', label: '', accounts }] : [], evmChains: one.evmChains };
  }
  const evm = new Map<string, string>();
  const evmChains = new Set<number>();
  for (const acc of ns.eip155?.accounts ?? []) {
    const m = /^eip155:(\d{1,12}):(0x[0-9a-fA-F]{40})$/.exec(acc);
    if (!m) continue;
    evm.set(m[2].toLowerCase(), m[2]);
    evmChains.add(Number(m[1]));
  }
  const sol = new Set<string>();
  for (const acc of ns.solana?.accounts ?? []) {
    const m = /^solana:([1-9A-HJ-NP-Za-km-z]{32}):([1-9A-HJ-NP-Za-km-z]{32,44})$/.exec(acc);
    if (m && `solana:${m[1]}` === SOLANA_CAIP) sol.add(m[2]);
  }
  const btc = new Set<string>();
  for (const acc of ns.bip122?.accounts ?? []) {
    const m = /^(bip122:[0-9a-f]{32}):([0-9A-Za-z]{25,90})$/.exec(acc);
    if (m && m[1] === BTC_CAIP && isValidBtcAddress(m[2])) btc.add(/^bc1/i.test(m[2]) ? m[2].toLowerCase() : m[2]);
  }
  const text = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u202a-\u202e\u2066-\u2069]/g, '').trim().slice(0, n) : '');
  const byKey = new Map<string, PhoneWallet>();
  for (const e of entries.slice(0, 100) as Record<string, unknown>[]) {
    if (!e || typeof e !== 'object') continue;
    const key = text(e.w, 64);
    const index = Number(e.i);
    if (!key || !Number.isInteger(index) || index < 0 || index > 99) continue;
    const ev = typeof e.e === 'string' ? evm.get(e.e.toLowerCase()) : undefined;
    const so = typeof e.s === 'string' && sol.has(e.s) ? e.s : undefined;
    const bRaw = typeof e.b === 'string' ? (/^bc1/i.test(e.b) ? e.b.toLowerCase() : e.b) : undefined;
    const bi = bRaw && btc.has(bRaw) ? bRaw : undefined;
    const tonPub = typeof e.t === 'string' && /^[0-9a-f]{64}$/.test(e.t) && index === 0 ? e.t : undefined;
    // Aucune adresse partagée pour ce compte : rien à montrer ni à signer.
    if (!ev && !so && !bi) continue;
    const w = byKey.get(key) ?? { key, label: text(e.wl, 40), accounts: [] };
    if (w.accounts.some((a) => a.index === index)) continue;
    w.accounts.push({ index, label: text(e.l, 40) || `Compte ${index + 1}`, evm: ev, solana: so, bitcoin: bi, ...(tonPub ? { tonPub } : {}) });
    byKey.set(key, w);
  }
  const wallets = [...byKey.values()].map((w) => ({ ...w, accounts: w.accounts.sort((a, b) => a.index - b.index) }));
  return { wallets, evmChains: [...evmChains] };
}

type Namespaces = Record<string, { accounts?: string[]; chains?: string[]; methods?: string[] } | undefined>;

const EVM_ADDR = /^0x[0-9a-fA-F]{40}$/;
const SOL_ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Adresses partagées par le téléphone. Une SEULE adresse par famille : deux
 * adresses EVM différentes dans une session, c'est une session qu'on ne
 * comprend pas — refusée plutôt que de signer pour la mauvaise.
 */
export function sessionAccounts(ns: Namespaces): { evm?: string; solana?: string; bitcoin?: string; evmChains: number[] } {
  const evm = new Set<string>();
  const sol = new Set<string>();
  const btc = new Set<string>();
  const evmChains: number[] = [];
  for (const acc of ns.eip155?.accounts ?? []) {
    const m = /^eip155:(\d{1,12}):(0x[0-9a-fA-F]{40})$/.exec(acc);
    if (!m) continue;
    evm.add(m[2].toLowerCase());
    evmChains.push(Number(m[1]));
  }
  for (const acc of ns.solana?.accounts ?? []) {
    const m = /^solana:([1-9A-HJ-NP-Za-km-z]{32}):([1-9A-HJ-NP-Za-km-z]{32,44})$/.exec(acc);
    if (m && `solana:${m[1]}` === SOLANA_CAIP && SOL_ADDR.test(m[2])) sol.add(m[2]);
  }
  for (const acc of ns.bip122?.accounts ?? []) {
    const m = /^(bip122:[0-9a-f]{32}):([0-9A-Za-z]{25,90})$/.exec(acc);
    // Réseau principal seulement ; bech32 ramené en minuscules (une seule forme pour comparer).
    if (m && m[1] === BTC_CAIP && isValidBtcAddress(m[2])) btc.add(/^bc1/i.test(m[2]) ? m[2].toLowerCase() : m[2]);
  }
  if (evm.size > 1 || sol.size > 1 || btc.size > 1) throw new RpcError(-32603, 'COMPANION_AMBIGUOUS');
  const evmAddr = [...evm][0];
  // Adresse EVM rendue avec la casse de la session (somme de contrôle) si elle y est.
  const evmCased = evmAddr ? (ns.eip155?.accounts ?? []).map((a) => a.split(':')[2]).find((a) => a?.toLowerCase() === evmAddr) : undefined;
  return { evm: evmCased && EVM_ADDR.test(evmCased) ? evmCased : undefined, solana: [...sol][0], bitcoin: [...btc][0], evmChains: [...new Set(evmChains)] };
}

/** Réseau EVM de la session pour une demande : celui du site s'il est partagé, sinon le premier partagé. */
export function evmChainFor(sessionChains: number[], wanted?: number): number {
  if (wanted !== undefined && sessionChains.includes(wanted)) return wanted;
  if (wanted !== undefined) throw new RpcError(4901, 'COMPANION_CHAIN');
  if (!sessionChains.length) throw new RpcError(4100, 'COMPANION_NO_EVM');
  return sessionChains.includes(1) ? 1 : sessionChains[0];
}

/* ── Résultats rendus par le téléphone : vérifiés avant d'atteindre le site ── */

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function checkPersonal(sig: unknown, hexOrText: string, from: string): string {
  if (typeof sig !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(sig)) throw new RpcError(-32603, 'COMPANION_BAD_RESULT');
  const data = isHexString(hexOrText) ? getBytes(hexOrText) : hexOrText;
  if (!same(verifyMessage(data, sig), from)) throw new RpcError(-32603, 'COMPANION_WRONG_SIGNER');
  return sig;
}

export function checkTyped(sig: unknown, data: { domain: Record<string, unknown>; types: Record<string, unknown>; message: unknown }, from: string): string {
  if (typeof sig !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(sig)) throw new RpcError(-32603, 'COMPANION_BAD_RESULT');
  const { EIP712Domain: _drop, ...types } = data.types;
  if (!same(verifyTypedData(data.domain as never, types as never, data.message as never, sig), from)) throw new RpcError(-32603, 'COMPANION_WRONG_SIGNER');
  return sig;
}

export function checkTxHash(h: unknown): string {
  if (typeof h !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(h)) throw new RpcError(-32603, 'COMPANION_BAD_RESULT');
  return h;
}

/** Signature Solana d'un message : base58 du téléphone → vérifiée → base64 (format Wallet Standard). */
export function checkSolMessage(res: unknown, bytes: Uint8Array, pubkey: string): Uint8Array {
  const s = (res as { signature?: unknown } | null)?.signature;
  let sig: Uint8Array;
  try {
    sig = base58.decode(String(s));
  } catch {
    throw new RpcError(-32603, 'COMPANION_BAD_RESULT');
  }
  if (sig.length !== 64 || !ed25519.verify(sig, bytes, base58.decode(pubkey))) throw new RpcError(-32603, 'COMPANION_WRONG_SIGNER');
  return sig;
}

/** Signature (base58) d'une transaction Solana envoyée par le téléphone. */
export function checkSolSignature(res: unknown): string {
  const s = (res as { signature?: unknown } | null)?.signature;
  if (typeof s !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(s)) throw new RpcError(-32603, 'COMPANION_BAD_RESULT');
  return s;
}

/** Transactions Solana signées rendues par le téléphone (base64). */
export function checkSolSigned(res: unknown, count: number): string[] {
  const r = res as { transaction?: unknown; transactions?: unknown } | null;
  const list = count === 1 && typeof r?.transaction === 'string' ? [r.transaction] : Array.isArray(r?.transactions) ? r!.transactions : [];
  if (list.length !== count || !list.every((x): x is string => typeof x === 'string' && x.length > 0 && x.length < 20_000)) throw new RpcError(-32603, 'COMPANION_BAD_RESULT');
  for (const x of list) base64.decode(x); // lève si ce n'est pas du base64
  return list;
}

/**
 * Transaction Solana NON signée à faire signer : un emplacement de signature
 * vide (64 zéros) devant les octets du message — le format qu'attend
 * `solana_signTransaction` / `solana_signAndSendTransaction`.
 */
export function unsignedSolanaTx(message: Uint8Array): string {
  const out = new Uint8Array(1 + 64 + message.length);
  out[0] = 1;
  out.set(message, 65);
  return base64.encode(out);
}

/** Transaction EVM au format JSON-RPC (quantités en hexadécimal). */
const qty = (v: bigint) => `0x${v.toString(16)}`;

export function evmTxParam(tx: { from: string; to: string; data: string; value: bigint; gas?: bigint }) {
  return { from: tx.from, to: tx.to, data: tx.data || '0x', value: qty(tx.value), ...(tx.gas ? { gas: qty(tx.gas) } : {}) };
}

/** Identifiant de transaction Bitcoin rendu par le téléphone : 64 caractères hexadécimaux, rien d'autre. */
export function checkBtcTxid(v: unknown): string {
  if (typeof v !== 'string' || !/^[0-9a-f]{64}$/i.test(v)) throw new RpcError(-32603, 'COMPANION_BAD_RESULT');
  return v.toLowerCase();
}
