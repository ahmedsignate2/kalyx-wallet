/**
 * Simulation d'une transaction Solana AVANT signature : ce qui bouge vraiment
 * sur le compte qui signe.
 *
 * Le nœud exécute la transaction sans l'inscrire (`simulateTransaction`) et
 * rend l'état APRÈS de comptes choisis ; on lit l'état AVANT des mêmes comptes
 * (`getMultipleAccounts`) et on compare :
 *   - SOL : lamports du compte qui signe ;
 *   - tokens SPL / Token-2022 : comptes de token dont CE compte est titulaire
 *     (y compris ceux créés, vidés ou fermés par la transaction) ;
 *   - délégation (instruction Approve) : qui peut ensuite dépenser ces tokens ;
 *   - changement de titulaire d'un compte de token : les tokens partent en entier.
 *
 * Seuls les comptes MODIFIABLES de la transaction peuvent changer : on lit ceux
 * de l'en-tête et ceux des tables de correspondance (v0), résolues sur la chaîne.
 * Aucune clé n'est demandée : l'appelant fournit `rpc` (relais ou nœud public).
 */
import { base58, base64 } from '@scure/base';
import { parseSolanaMessage } from '../wc/solanaTx';
import { KNOWN_MINTS, SPL_TOKEN_2022_PROGRAM, SPL_TOKEN_PROGRAM } from '../tokens/splTokens';
import type { AssetChange, Simulation } from './simulate';

export type SolanaRpc = <T = unknown>(method: string, params: unknown[]) => Promise<T>;

interface RpcAccount {
  data: [string, string] | string[];
  owner: string;
  lamports: number;
}

/** Au-delà, la lecture serait trop lourde pour une fenêtre de signature. */
const MAX_ACCOUNTS = 64;
/** Variation de SOL plus petite : les frais du réseau, pas un mouvement. */
const FEE_DUST = 50_000n;
const U64_HALF = 1n << 63n;

/** Message (sans les signatures) d'une transaction sérialisée. */
export function messageOf(tx: Uint8Array): Uint8Array {
  let n = 0;
  let off = 0;
  for (let shift = 0; ; shift += 7) {
    const b = tx[off++];
    if (b === undefined) throw new Error('transaction vide');
    n |= (b & 0x7f) << shift;
    if (!(b & 0x80)) break;
    if (shift > 14) throw new Error('compact-u16 invalide');
  }
  return tx.subarray(off + n * 64);
}

/** Comptes modifiables de l'en-tête (les tables sont résolues à part). */
export function writableStatic(msg: ReturnType<typeof parseSolanaMessage>): string[] {
  const { keys, signerCount, readonlySigned, readonlyUnsigned } = msg;
  return keys.filter((_, i) => (i < signerCount ? i < signerCount - readonlySigned : i < keys.length - readonlyUnsigned));
}

/** Adresses d'une table de correspondance (en-tête de 56 octets, puis 32 octets par adresse). */
export function lookupAddresses(data: Uint8Array): string[] {
  const out: string[] = [];
  for (let o = 56; o + 32 <= data.length; o += 32) out.push(base58.encode(data.subarray(o, o + 32)));
  return out;
}

const u64le = (b: Uint8Array, o: number): bigint => {
  let v = 0n;
  for (let i = 7; i >= 0; i--) v = (v << 8n) | BigInt(b[o + i]);
  return v;
};

export interface TokenAccountState {
  mint: string;
  owner: string;
  amount: bigint;
  delegate: string | null;
  delegatedAmount: bigint;
}

/** Compte de token SPL / Token-2022 (165 octets, ou plus avec le type « compte » = 2). Null sinon. */
export function parseTokenAccount(programOwner: string, data: Uint8Array): TokenAccountState | null {
  if (programOwner !== SPL_TOKEN_PROGRAM && programOwner !== SPL_TOKEN_2022_PROGRAM) return null;
  if (data.length < 165 || (data.length > 165 && data[165] !== 2)) return null;
  const hasDelegate = data[72] === 1;
  return {
    mint: base58.encode(data.subarray(0, 32)),
    owner: base58.encode(data.subarray(32, 64)),
    amount: u64le(data, 64),
    delegate: hasDelegate ? base58.encode(data.subarray(76, 108)) : null,
    delegatedAmount: hasDelegate ? u64le(data, 121) : 0n,
  };
}

const bytesOf = (a: RpcAccount | null | undefined): Uint8Array => (a && Array.isArray(a.data) && typeof a.data[0] === 'string' ? base64.decode(a.data[0]) : new Uint8Array());

/** Erreur du simulateur → une phrase courte (la cause du programme quand les journaux la donnent). */
export function solanaSimError(err: unknown, logs: string[] | null | undefined): string {
  const hint = (logs ?? []).slice().reverse().find((l) => /error|failed|insufficient|slippage|exceeds/i.test(l) && !/consumed/.test(l));
  const base = typeof err === 'string' ? err : JSON.stringify(err);
  const msg = hint ? hint.replace(/^Program log: /, '').replace(/^Program \w+ /, '') : base;
  return msg.length > 200 ? `${msg.slice(0, 199)}…` : msg;
}

/**
 * Simule `txB64` pour le compte `owner`. Lève si le nœud ne répond pas (l'appelant
 * dira « aperçu indisponible ») ; une transaction qui ÉCHOUERAIT rend `error`.
 */
export async function simulateSolanaTx(rpc: SolanaRpc, txB64: string, owner: string): Promise<Simulation> {
  const msg = parseSolanaMessage(messageOf(base64.decode(txB64)));
  const writable = new Set(writableStatic(msg));
  if (msg.lookups.length) {
    const tables = await rpc<{ value: (RpcAccount | null)[] }>('getMultipleAccounts', [msg.lookups.map((l) => l.table), { encoding: 'base64' }]);
    msg.lookups.forEach((l, i) => {
      const addrs = lookupAddresses(bytesOf(tables.value[i]));
      for (const idx of l.writable) if (addrs[idx]) writable.add(addrs[idx]);
    });
  }
  writable.add(owner);
  const addresses = [...writable].slice(0, MAX_ACCOUNTS);
  if (!addresses.includes(owner)) addresses[addresses.length - 1] = owner;

  const [before, sim] = await Promise.all([
    rpc<{ value: (RpcAccount | null)[] }>('getMultipleAccounts', [addresses, { encoding: 'base64', commitment: 'confirmed' }]),
    rpc<{ value: { err: unknown; logs?: string[] | null; accounts?: (RpcAccount | null)[] | null } }>('simulateTransaction', [
      txB64,
      { encoding: 'base64', sigVerify: false, replaceRecentBlockhash: true, commitment: 'confirmed', accounts: { encoding: 'base64', addresses } },
    ]),
  ]);
  const v = sim.value;
  if (v.err) return { source: 'node', changes: [], approvals: [], error: solanaSimError(v.err, v.logs) };
  const after = v.accounts ?? [];

  // SOL du compte qui signe.
  const i = addresses.indexOf(owner);
  const solDelta = BigInt(after[i]?.lamports ?? 0) - BigInt(before.value[i]?.lamports ?? 0);
  // Tokens : solde du titulaire `owner`, par mint.
  const deltas = new Map<string, bigint>();
  const approvals: Simulation['approvals'] = [];
  const lostTo = new Map<string, string>();
  addresses.forEach((_, k) => {
    const pre = before.value[k] ? parseTokenAccount(before.value[k]!.owner, bytesOf(before.value[k])) : null;
    const post = after[k] ? parseTokenAccount(after[k]!.owner, bytesOf(after[k])) : null;
    const mine = (s: TokenAccountState | null) => (s && s.owner === owner ? s.amount : 0n);
    const mint = post?.mint ?? pre?.mint;
    if (!mint) return;
    const d = mine(post) - mine(pre);
    if (d !== 0n) deltas.set(mint, (deltas.get(mint) ?? 0n) + d);
    // Titulaire changé : ces tokens appartiennent désormais à quelqu'un d'autre.
    if (pre?.owner === owner && post && post.owner !== owner) lostTo.set(mint, post.owner);
    // Nouvelle délégation : un tiers pourra dépenser sans nouvelle signature.
    if (post?.owner === owner && post.delegate && (post.delegate !== pre?.delegate || post.delegatedAmount > (pre?.delegatedAmount ?? 0n))) {
      approvals.push({ spender: post.delegate, token: mint, unlimited: post.delegatedAmount >= U64_HALF });
    }
  });

  const mints = [...deltas.keys()].filter((m) => deltas.get(m) !== 0n);
  const decimals = new Map<string, number>();
  if (mints.length) {
    const info = await rpc<{ value: (RpcAccount | null)[] }>('getMultipleAccounts', [mints, { encoding: 'base64' }]).catch(() => null);
    mints.forEach((m, k) => {
      const d = bytesOf(info?.value[k]);
      if (d.length >= 45) decimals.set(m, d[44]);
    });
  }

  const changes: AssetChange[] = [];
  if (solDelta < -FEE_DUST || solDelta > FEE_DUST) {
    changes.push({ direction: solDelta < 0n ? 'out' : 'in', assetType: 'NATIVE', symbol: 'SOL', rawAmount: (solDelta < 0n ? -solDelta : solDelta).toString(), decimals: 9 });
  }
  for (const m of mints) {
    const d = deltas.get(m)!;
    const known = KNOWN_MINTS[m];
    const dec = decimals.get(m);
    // NFT : un seul exemplaire d'un mint à 0 décimale.
    changes.push({
      direction: d < 0n ? 'out' : 'in',
      assetType: dec === 0 && (d === 1n || d === -1n) ? 'ERC721' : dec === undefined ? 'UNKNOWN' : 'ERC20',
      symbol: known?.symbol ?? `${m.slice(0, 4)}…${m.slice(-4)}`,
      // Décimales illisibles : montant « ? » plutôt qu'un nombre brut trompeur.
      rawAmount: dec === undefined ? '?' : (d < 0n ? -d : d).toString(),
      decimals: dec ?? 0,
      contract: m,
      ...(known?.logo ? { logo: known.logo } : {}),
      ...(lostTo.has(m) ? { counterparty: lostTo.get(m) } : {}),
    });
  }
  return { source: 'node', changes, approvals };
}
