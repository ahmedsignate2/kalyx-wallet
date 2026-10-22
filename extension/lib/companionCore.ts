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

export const SOLANA_CAIP = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
export const EVM_METHODS = ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4'];
export const SOL_METHODS = ['solana_signMessage', 'solana_signTransaction', 'solana_signAllTransactions', 'solana_signAndSendTransaction'];

/** Ce que l'extension propose au téléphone : les réseaux EVM qu'elle connaît, et Solana. Tout est optionnel : le téléphone partage ce qu'il a. */
export function proposal(evmChainIds: number[]) {
  const chains = [...new Set(evmChainIds.filter((n) => Number.isSafeInteger(n) && n > 0))].map((n) => `eip155:${n}`);
  return {
    optionalNamespaces: {
      eip155: { chains, methods: EVM_METHODS, events: ['accountsChanged', 'chainChanged'] },
      solana: { chains: [SOLANA_CAIP], methods: SOL_METHODS, events: [] as string[] },
    },
  };
}

type Namespaces = Record<string, { accounts?: string[]; chains?: string[]; methods?: string[] } | undefined>;

const EVM_ADDR = /^0x[0-9a-fA-F]{40}$/;
const SOL_ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Adresses partagées par le téléphone. Une SEULE adresse par famille : deux
 * adresses EVM différentes dans une session, c'est une session qu'on ne
 * comprend pas — refusée plutôt que de signer pour la mauvaise.
 */
export function sessionAccounts(ns: Namespaces): { evm?: string; solana?: string; evmChains: number[] } {
  const evm = new Set<string>();
  const sol = new Set<string>();
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
  if (evm.size > 1 || sol.size > 1) throw new RpcError(-32603, 'COMPANION_AMBIGUOUS');
  const evmAddr = [...evm][0];
  // Adresse EVM rendue avec la casse de la session (somme de contrôle) si elle y est.
  const evmCased = evmAddr ? (ns.eip155?.accounts ?? []).map((a) => a.split(':')[2]).find((a) => a?.toLowerCase() === evmAddr) : undefined;
  return { evm: evmCased && EVM_ADDR.test(evmCased) ? evmCased : undefined, solana: [...sol][0], evmChains: [...new Set(evmChains)] };
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
